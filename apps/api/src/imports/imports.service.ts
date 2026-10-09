import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { changeCorrections, reviewedCandidate } from '@rovere/domain';
import type { ImportCandidate, KnownValue, RowCorrections } from '@rovere/domain';
import { LIMITS } from '@rovere/importers';
import { Prisma } from '../generated/prisma/client.js';
import { DATABASE } from '../accounts/accounts.controller.js';
import type { Database } from '../database.js';
import { configuration, fail, json, key, object, version } from './validation.js';

const projection = { id: true, filename: true, format: true, status: true, version: true, size: true, rowCount: true,
  attempts: true, errorCode: true, configuration: true, parsedMetadata: true, createdAt: true, updatedAt: true } as const;
function canonical(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 150) fail(400, 'INVALID_ID', 'Identificador inválido.');
  return value;
}
function pageNumber(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d{0,5}$/.test(value) || Number(value) > maximum) fail(400, 'INVALID_PAGINATION', 'Paginação inválida.');
  return Number(value);
}
type Tx = Prisma.TransactionClient;
export interface Upload { buffer: Uint8Array; originalname: string; size: number }

@Injectable()
export class ImportsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  list(userId: string) { return this.db.importBatch.findMany({ where: { userId }, select: projection, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 20 }); }
  async get(userId: string, batchId: string) {
    const batch = await this.db.importBatch.findUnique({ where: { id_userId: { id: batchId, userId } }, select: projection });
    if (!batch) fail(404, 'IMPORT_NOT_FOUND', 'Importação não encontrada.');
    const blocks = await this.db.importBlock.findMany({ where: { batchId, userId }, select: { id: true, kind: true, metadata: true,
      financialAccountId: true, creditAccountId: true, cardId: true, statementId: true, periodOverride: true }, orderBy: { id: 'asc' } });
    return { ...batch, blocks };
  }
  async upload(userId: string, file: Upload | undefined, body: unknown, header: unknown) {
    const fields = object(body, ['format', 'configuration']); const creationKey = key(header);
    if (!file?.buffer.byteLength || file.buffer.byteLength > LIMITS.bytes) fail(400, 'INVALID_FILE', 'Envie um arquivo de até 10 MiB.');
    if (typeof fields.configuration !== 'string' || fields.configuration.length > 16000) fail(400, 'INVALID_CONFIGURATION', 'Informe a configuração do arquivo.');
    let parsedConfiguration: unknown;
    try { parsedConfiguration = JSON.parse(fields.configuration); } catch { fail(400, 'INVALID_CONFIGURATION', 'Configuração inválida.'); }
    const config = configuration(fields.format, parsedConfiguration); const format = fields.format as 'csv' | 'ofx';
    const filename = file.originalname.replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 160);
    if (!filename.toLowerCase().endsWith(`.${format}`)) fail(400, 'INVALID_FILE_EXTENSION', 'A extensão deve corresponder ao formato selecionado.');
    const requestHash = createHash('sha256').update(file.buffer).update(canonical({ filename, format, config })).digest('hex');
    return this.db.$transaction(async tx => {
      // Serialize per-user quota/idempotency checks without locking unrelated users.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const existing = await tx.importBatch.findUnique({ where: { userId_creationKey: { userId, creationKey } }, select: { ...projection, requestHash: true } });
      if (existing) {
        if (existing.requestHash !== requestHash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outro arquivo ou configuração.');
        const { requestHash: ignored, ...result } = existing; return result;
      }
      const quota = await tx.importBatch.aggregate({ where: { userId, status: { not: 'cancelled' } }, _sum: { size: true }, _count: true });
      if (quota._count >= 20 || (quota._sum.size ?? 0) + file.buffer.byteLength > 50 * 1024 * 1024) fail(409, 'IMPORT_QUOTA', 'Remova importações anteriores antes de enviar outro arquivo.');
      const batch = await tx.importBatch.create({ data: { userId, filename, format, configuration: json(config), creationKey, requestHash, size: file.buffer.byteLength }, select: projection });
      await tx.importFile.create({ data: { batchId: batch.id, userId, bytes: new Uint8Array(file.buffer) } });
      return batch;
    });
  }
  async file(userId: string, batchId: string) {
    const batch = await this.get(userId, batchId);
    const file = await this.db.importFile.findUnique({ where: { batchId_userId: { batchId, userId } }, select: { bytes: true } });
    if (!file) fail(404, 'FILE_NOT_FOUND', 'Arquivo não encontrado.');
    return { filename: `${batch.id}.${batch.format}`, bytes: file.bytes };
  }
  async rows(userId: string, batchId: string, query: Record<string, unknown>) {
    const batch = await this.get(userId, batchId);
    if (batch.status !== 'review') fail(409, 'IMPORT_NOT_IN_REVIEW', 'A importação ainda não está em revisão.');
    object(query, ['page', 'pageSize', 'selected']);
    const page = pageNumber(query.page, 1, 10000); const pageSize = pageNumber(query.pageSize, 25, 100);
    if (query.selected !== undefined && !['true', 'false'].includes(query.selected as string)) fail(400, 'INVALID_FILTER', 'Filtro inválido.');
    const where = { batchId, userId, ...(query.selected === undefined ? {} : { selected: query.selected === 'true' }) };
    // A consistent database snapshot prevents mixing a new review version with old row data.
    return this.db.$transaction(async tx => {
      const current = await tx.importBatch.findUniqueOrThrow({ where: { id_userId: { id: batchId, userId } }, select: { version: true, status: true } });
      if (current.status !== 'review') fail(409, 'IMPORT_NOT_IN_REVIEW', 'A importação não está em revisão.');
      const blocks = await tx.importBlock.findMany({ where: { batchId, userId }, include: { statement: { select: { period: true } } } });
      const values = await tx.importRow.findMany({ where, include: { source: true }, orderBy: { source: { ordinal: 'asc' } }, skip: (page - 1) * pageSize, take: pageSize });
      const total = await tx.importRow.count({ where });
      const rows = values.map(row => {
        let candidate = reviewedCandidate(row.candidate as unknown as ImportCandidate, row.corrections as unknown as RowCorrections);
        const block = blocks.find(value => value.id === row.source.blockId)!;
        const issues = [...candidate.issues];
        if (block.kind === 'bank' && !block.financialAccountId || block.kind === 'card' && !block.creditAccountId) issues.push({ code: 'DESTINATION_REQUIRED', field: 'destination', blocking: true });
        if (block.kind === 'card') {
          if (block.statementId) {
            const originalPeriod = row.source.period as unknown as KnownValue<string>;
            if (originalPeriod.state === 'confirmed' && originalPeriod.value !== block.statement?.period && !block.periodOverride) issues.push({ code: 'STATEMENT_PERIOD_CONFLICT', field: 'statementId', blocking: true });
            candidate = { ...candidate, statementId: { state: 'confirmed', value: block.statementId, evidence: { kind: 'user', decisionId: block.decisionId! } } };
          } else if (!issues.some(issue => issue.code === 'STATEMENT_PERIOD_REQUIRED')) issues.push({ code: 'STATEMENT_PERIOD_REQUIRED', field: 'statementId', blocking: true });
        }
        return { id: row.id, selected: row.selected, action: row.action, reason: row.reason, corrections: row.corrections,
          originalCandidate: row.candidate, candidate: { ...candidate, issues: block.statementId ? issues.filter(issue => issue.code !== 'STATEMENT_PERIOD_REQUIRED') : issues },
          source: { id: row.source.id, blockId: row.source.blockId, ordinal: row.source.ordinal, raw: row.source.raw, fields: row.source.fields, period: row.source.period } };
      });
      return { version: current.version, page, pageSize, total, rows };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async review(userId: string, batchId: string, body: unknown) {
    const data = object(body, ['expectedVersion', 'blocks', 'rows', 'all']); const expectedVersion = version(data.expectedVersion);
    await this.get(userId, batchId);
    if (!data.blocks && !data.rows && !data.all) fail(400, 'EMPTY_REVIEW', 'Informe uma alteração para a revisão.');
    if (data.blocks !== undefined && (!Array.isArray(data.blocks) || data.blocks.length > 100) || data.rows !== undefined && (!Array.isArray(data.rows) || data.rows.length > 50)) fail(400, 'INVALID_REVIEW', 'Limite de alterações por requisição excedido.');
    const decisionId = randomUUID();
    return this.db.$transaction(async tx => {
      const updated = await tx.importBatch.updateMany({ where: { id: batchId, userId, status: 'review', version: expectedVersion }, data: { version: { increment: 1 } } });
      if (updated.count !== 1) fail(409, 'REVIEW_CONFLICT', 'A revisão mudou. Recarregue antes de salvar.');
      for (const value of (data.blocks ?? []) as unknown[]) await this.target(tx, userId, batchId, value, decisionId);
      if (data.all !== undefined) {
        const all = object(data.all, ['blockId', 'selected']);
        if (typeof all.selected !== 'boolean') fail(400, 'INVALID_SELECTION', 'Informe a seleção das linhas.');
        if (all.blockId !== undefined && !await tx.importBlock.findFirst({ where: { id: id(all.blockId), batchId, userId } })) fail(404, 'BLOCK_NOT_FOUND', 'Bloco não encontrado.');
        await tx.importRow.updateMany({ where: { batchId, userId, ...(all.blockId === undefined ? {} : { source: { blockId: all.blockId as string } }) },
          data: { selected: all.selected, action: all.selected ? 'create' : 'skip', reason: all.selected ? null : 'Excluída na revisão' } });
      }
      const rowIds = new Set<string>();
      for (const value of (data.rows ?? []) as unknown[]) {
        const patch = object(value, ['id', 'selected', 'corrections', 'reason']); const rowId = id(patch.id);
        if (rowIds.has(rowId)) fail(400, 'DUPLICATE_ROW', 'Linha repetida na alteração.'); rowIds.add(rowId);
        const row = await tx.importRow.findFirst({ where: { id: rowId, batchId, userId } });
        if (!row) fail(404, 'ROW_NOT_FOUND', 'Linha não encontrada.');
        if (patch.selected !== undefined && typeof patch.selected !== 'boolean') fail(400, 'INVALID_SELECTION', 'Seleção inválida.');
        if (patch.reason !== undefined && (typeof patch.reason !== 'string' || patch.reason.length > 500)) fail(400, 'INVALID_REASON', 'Motivo inválido.');
        let corrections = row.corrections as unknown as RowCorrections;
        if (patch.corrections !== undefined) {
          try { corrections = changeCorrections(corrections, patch.corrections, decisionId); } catch { fail(400, 'INVALID_CORRECTIONS', 'Confira data, descrição, centavos e parcelas.'); }
        }
        const selected = patch.selected === undefined ? row.selected : patch.selected;
        await tx.importRow.update({ where: { id: rowId }, data: { corrections: json(corrections), selected, action: selected ? 'create' : 'skip',
          reason: selected ? null : patch.reason as string ?? row.reason ?? 'Excluída na revisão' } });
      }
      await tx.importReviewRevision.create({ data: { id: decisionId, batchId, userId, version: expectedVersion + 1, changes: json(data) } });
      return { id: batchId, version: expectedVersion + 1 };
    });
  }
  private async target(tx: Tx, userId: string, batchId: string, value: unknown, decisionId: string) {
    const data = object(value, ['id', 'financialAccountId', 'creditAccountId', 'cardId', 'statementId', 'periodOverride']);
    for (const field of ['financialAccountId', 'creditAccountId', 'cardId', 'statementId']) {
      if (data[field] !== undefined && data[field] !== null) id(data[field]);
    }
    const blockId = id(data.id); const block = await tx.importBlock.findFirst({ where: { id: blockId, userId, batchId } });
    if (!block) fail(404, 'BLOCK_NOT_FOUND', 'Bloco não encontrado.');
    const fields = { financialAccountId: null as string | null, creditAccountId: null as string | null, cardId: null as string | null,
      statementId: null as string | null, periodOverride: false, decisionId };
    if (data.periodOverride !== undefined && typeof data.periodOverride !== 'boolean') fail(400, 'INVALID_TARGET', 'Confirmação de competência inválida.');
    if (block.kind === 'bank') {
      if (data.creditAccountId || data.cardId || data.statementId || data.periodOverride) fail(400, 'INVALID_TARGET', 'Selecione uma conta bancária para este bloco.');
      if (data.financialAccountId) {
        fields.financialAccountId = id(data.financialAccountId);
        if (!await tx.financialAccount.findUnique({ where: { id_userId: { id: fields.financialAccountId, userId } } })) fail(404, 'DESTINATION_NOT_FOUND', 'Destino não encontrado.');
      }
    } else {
      if (data.financialAccountId) fail(400, 'INVALID_TARGET', 'Selecione crédito para este bloco.');
      if (data.creditAccountId) {
        fields.creditAccountId = id(data.creditAccountId);
        if (!await tx.creditAccount.findUnique({ where: { id_userId: { id: fields.creditAccountId, userId } } })) fail(404, 'DESTINATION_NOT_FOUND', 'Destino não encontrado.');
        if (data.cardId) {
          fields.cardId = id(data.cardId);
          if (!await tx.card.findFirst({ where: { id: fields.cardId, userId, creditAccountId: fields.creditAccountId } })) fail(404, 'DESTINATION_NOT_FOUND', 'Cartão não encontrado neste crédito.');
        }
        if (data.statementId) {
          fields.statementId = id(data.statementId);
          if (!await tx.statement.findFirst({ where: { id: fields.statementId, userId, creditAccountId: fields.creditAccountId } })) fail(404, 'DESTINATION_NOT_FOUND', 'Competência não encontrada neste crédito.');
        }
      } else if (data.cardId || data.statementId) fail(400, 'INVALID_TARGET', 'Selecione primeiro a conta de crédito.');
      if (data.periodOverride && !fields.statementId) fail(400, 'INVALID_TARGET', 'Selecione uma competência para confirmar a divergência.');
      fields.periodOverride = data.periodOverride === true;
    }
    await tx.importBlock.update({ where: { id: blockId }, data: fields });
  }
  async retry(userId: string, batchId: string, body: unknown) {
    const data = object(body, ['expectedVersion', 'configuration']); const expectedVersion = version(data.expectedVersion);
    const batch = await this.get(userId, batchId);
    const config = data.configuration === undefined ? batch.configuration : configuration(batch.format, data.configuration);
    await this.db.$transaction(async tx => {
      const updated = await tx.importBatch.updateMany({ where: { id: batchId, userId, status: 'failed', version: expectedVersion },
        data: { status: 'uploaded', version: { increment: 1 }, configuration: json(config), attempts: 0, errorCode: null, leaseUntil: null, leaseToken: null } });
      if (updated.count !== 1) fail(409, 'RETRY_CONFLICT', 'Somente uma falha na versão atual pode ser reprocessada.');
      await tx.importReviewRevision.create({ data: { batchId, userId, version: expectedVersion + 1,
        changes: json({ action: 'retry', previousConfiguration: batch.configuration, configuration: config, previousAttempts: batch.attempts, previousError: batch.errorCode }) } });
    });
    return this.get(userId, batchId);
  }
  async cancel(userId: string, batchId: string, body: unknown) {
    const expectedVersion = version(object(body, ['expectedVersion']).expectedVersion); await this.get(userId, batchId);
    return this.db.$transaction(async tx => {
      const result = await tx.importBatch.updateMany({ where: { id: batchId, userId, version: expectedVersion, status: { in: ['uploaded', 'failed', 'review'] } },
        data: { status: 'cancelled', version: { increment: 1 }, size: 0, rowCount: 0, filename: '[removido]', configuration: {}, parsedMetadata: Prisma.DbNull } });
      if (result.count !== 1) fail(409, 'CANCEL_CONFLICT', 'Atualize a revisão; parsing em execução não pode ser removido.');
      await tx.importFile.deleteMany({ where: { batchId, userId } });
      await tx.importBlock.deleteMany({ where: { batchId, userId } });
      await tx.importReviewRevision.deleteMany({ where: { batchId, userId } });
      return { id: batchId, status: 'cancelled', version: expectedVersion + 1 };
    });
  }
}
