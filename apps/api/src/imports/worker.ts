import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import type { ParsedFile } from '@rovere/importers';
import { DATABASE } from '../accounts/accounts.controller.js';
import type { Database } from '../database.js';
import { json } from './validation.js';

export const IMPORT_WORKER_ENABLED = Symbol('IMPORT_WORKER_ENABLED');
export function parseInWorker(bytes: Uint8Array, id: string, format: string, configuration: unknown, timeout = 30000): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../dist/imports/parse.worker.js', import.meta.url), {
      workerData: { bytes, id, format, configuration }, resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
    });
    let done = false;
    const finish = (error?: string, parsed?: ParsedFile) => {
      if (done) return; done = true; clearTimeout(timer); void worker.terminate();
      if (error) reject(new Error(error)); else resolve(parsed!);
    };
    const timer = setTimeout(() => finish('PARSER_TIMEOUT'), timeout);
    worker.once('message', (message: { parsed?: ParsedFile; error?: string }) => finish(message.error, message.parsed));
    worker.once('error', () => finish('PARSER_FAILED'));
    worker.once('exit', () => { if (!done) finish('PARSER_FAILED'); });
  });
}
@Injectable()
export class ImportWorker implements OnModuleInit, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;
  private current: Promise<boolean> | undefined;
  private stopped = false;
  constructor(@Inject(DATABASE) private readonly db: Database, @Inject(IMPORT_WORKER_ENABLED) private readonly enabled: boolean) {}
  onModuleInit() {
    if (!this.enabled) return;
    this.timer = setInterval(() => {
      if (this.current || this.stopped) return;
      this.current = this.runOnce().catch(() => { console.warn('IMPORT_WORKER_FAILED'); return false; }).finally(() => { this.current = undefined; });
    }, 500);
  }
  async stop() { this.stopped = true; clearInterval(this.timer); await this.current; }
  async onApplicationShutdown() { await this.stop(); }
  async runOnce(): Promise<boolean> {
    await this.db.importBatch.updateMany({ where: { status: 'parsing', attempts: { gte: 3 }, leaseUntil: { lt: new Date() } },
      data: { status: 'failed', errorCode: 'ATTEMPTS_EXHAUSTED', leaseToken: null, leaseUntil: null, version: { increment: 1 } } });
    const token = randomUUID();
    const claimed = await this.db.$queryRaw<{ id: string; userId: string }[]>`
      UPDATE "ImportBatch" SET "status" = 'parsing', "attempts" = "attempts" + 1,
        "leaseToken" = ${token}, "leaseUntil" = CURRENT_TIMESTAMP + INTERVAL '120 seconds', "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = (SELECT "id" FROM "ImportBatch" WHERE ("status" = 'uploaded' OR
        ("status" = 'parsing' AND "leaseUntil" < CURRENT_TIMESTAMP)) AND "attempts" < 3
        ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING "id", "userId"`;
    const claim = claimed[0]; if (!claim) return false;
    try {
      const batch = await this.db.importBatch.findUniqueOrThrow({ where: { id_userId: claim }, include: { file: true } });
      if (!batch.file) throw new Error('FILE_UNAVAILABLE');
      const parsed = await this.parse(batch.file.bytes, batch.id, batch.format, batch.configuration);
      await this.db.$transaction(async tx => {
        const fenced = await tx.importBatch.updateMany({ where: { id: claim.id, userId: claim.userId, status: 'parsing', leaseToken: token },
          data: { status: 'review', version: { increment: 1 }, rowCount: parsed.rows.length, leaseToken: null, leaseUntil: null, errorCode: null,
            parsedMetadata: json({ format: parsed.format, adapterVersion: parsed.adapterVersion, encoding: parsed.encoding, configuration: parsed.configuration }) } });
        if (fenced.count !== 1) return;
        await tx.importBlock.createMany({ data: parsed.blocks.map(block => ({ id: block.id, batchId: claim.id, userId: claim.userId, kind: block.kind, metadata: json(block) })) });
        for (let offset = 0; offset < parsed.rows.length; offset += 250) {
          const rows = parsed.rows.slice(offset, offset + 250);
          await tx.importSourceRecord.createMany({ data: rows.map(row => ({ id: row.source.id, batchId: claim.id, userId: claim.userId, blockId: row.blockId,
            ordinal: row.ordinal, raw: row.source.raw, fields: json(row.source.fields), period: json(row.statementPeriod) })) });
          await tx.importRow.createMany({ data: rows.map(row => ({ id: row.candidate.rowId, batchId: claim.id, userId: claim.userId, sourceRecordId: row.source.id, candidate: json(row.candidate) })) });
        }
      }, { timeout: 60000 });
    } catch (error) {
      const code = error instanceof Error && /^[A-Z_]{1,100}$/.test(error.message) ? error.message : 'PROCESSING_FAILED';
      await this.db.importBatch.updateMany({ where: { id: claim.id, userId: claim.userId, status: 'parsing', leaseToken: token },
        data: { status: 'failed', errorCode: code, leaseToken: null, leaseUntil: null, version: { increment: 1 } } });
    }
    return true;
  }
  parse(bytes: Uint8Array, id: string, format: string, configuration: unknown) { return parseInWorker(bytes, id, format, configuration); }
}
