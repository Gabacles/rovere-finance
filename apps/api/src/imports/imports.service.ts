import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { changeCorrections, confirmationValue, effectiveCandidate } from '@rovere/domain';
import type { ImportCandidate, KnownValue, RowCorrections } from '@rovere/domain';
import { LIMITS } from '@rovere/importers';
import { Prisma } from '../generated/prisma/client.js';
import { DATABASE } from '../accounts/accounts.controller.js';
import type { Database } from '../database.js';
import { configuration, fail, json, key, object, version } from './validation.js';
import { findRecord, originNamespace, suggestions } from './financial-records.js';

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
    const batch = await this.db.importBatch.findUnique({ where: { id_userId: { id: batchId, userId } }, select: { ...projection, confirmation: { select: { result: true } } } });
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
      const quota = await tx.importBatch.aggregate({ where: { userId, file: { isNot: null } }, _sum: { size: true }, _count: true });
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
    if (!['review', 'confirmed'].includes(batch.status)) fail(409, 'IMPORT_NOT_IN_REVIEW', 'A importação ainda não está em revisão.');
    object(query, ['page', 'pageSize', 'selected']);
    const page = pageNumber(query.page, 1, 10000); const pageSize = pageNumber(query.pageSize, 25, 100);
    if (query.selected !== undefined && !['true', 'false'].includes(query.selected as string)) fail(400, 'INVALID_FILTER', 'Filtro inválido.');
    const where = { batchId, userId, ...(query.selected === undefined ? {} : { selected: query.selected === 'true' }) };
    // A consistent database snapshot prevents mixing a new review version with old row data.
    return this.db.$transaction(async tx => {
      const current = await tx.importBatch.findUniqueOrThrow({ where: { id_userId: { id: batchId, userId } }, select: { version: true, status: true } });
      if (!['review', 'confirmed'].includes(current.status)) fail(409, 'IMPORT_NOT_IN_REVIEW', 'A importação não está em revisão.');
      const blocks = await tx.importBlock.findMany({ where: { batchId, userId }, include: { statement: { select: { period: true } } } });
      const values = await tx.importRow.findMany({ where, include: { source: true }, orderBy: { source: { ordinal: 'asc' } }, skip: (page - 1) * pageSize, take: pageSize });
      const total = await tx.importRow.count({ where });
      const rows = await Promise.all(values.map(async row => {
        const block = blocks.find(value => value.id === row.source.blockId)!;
        const candidate = effectiveCandidate(row.candidate as unknown as ImportCandidate, row.corrections as unknown as RowCorrections, row.source.period as unknown as KnownValue<string>, block);
        let matches: Awaited<ReturnType<typeof suggestions>> = [];
        if (current.status === 'review') {
          let value;
          try { value = confirmationValue(candidate, block); } catch { value = undefined; }
          if (value) matches = await suggestions(tx, userId, value, originNamespace(batch.format, batch.configuration, block.metadata), candidate.externalId.state === 'confirmed' ? candidate.externalId.value : null);
        }
        return { id: row.id, selected: row.selected, action: row.action, reason: row.reason, corrections: row.corrections,
          linkId: row.linkBankEntryId ?? row.linkCardChargeId, distinctFrom: row.distinctBankEntryId ?? row.distinctCardChargeId,
          matches: matches.map(match => ({ id: match.id, description: match.description, postedOn: match.postedOn, cents: match.cents, reason: match.reason, compatible: match.compatible })),
          originalCandidate: row.candidate, candidate,
          source: { id: row.source.id, blockId: row.source.blockId, ordinal: row.source.ordinal, raw: row.source.raw, fields: row.source.fields, period: row.source.period } };
      }));
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
      const resolved: { id: string; action: string; recordId: string }[] = [];
      if (data.all !== undefined) {
        const all = object(data.all, ['blockId', 'selected', 'reconcile']);
        if (all.selected !== undefined && typeof all.selected !== 'boolean' || all.reconcile !== undefined && !['link', 'distinct'].includes(all.reconcile as string) || all.selected === undefined && all.reconcile === undefined) fail(400, 'INVALID_SELECTION', 'Informe seleção ou decisão em lote.');
        if (all.blockId !== undefined && !await tx.importBlock.findFirst({ where: { id: id(all.blockId), batchId, userId } })) fail(404, 'BLOCK_NOT_FOUND', 'Bloco não encontrado.');
        if (all.selected !== undefined) await tx.importRow.updateMany({ where: { batchId, userId, ...(all.selected ? { selected: false } : {}), ...(all.blockId === undefined ? {} : { source: { blockId: all.blockId as string } }) },
          data: { selected: all.selected, action: all.selected ? 'create' : 'skip', reason: all.selected ? null : 'Excluída na revisão',
            linkBankEntryId: null, linkCardChargeId: null, distinctBankEntryId: null, distinctCardChargeId: null } });
        if (all.reconcile) {
          const selected = await tx.importRow.findMany({ where: { batchId, userId, selected: true, action: 'create', distinctBankEntryId: null, distinctCardChargeId: null,
            ...(all.blockId === undefined ? {} : { source: { blockId: all.blockId as string } }) }, include: { source: { include: { block: { include: { statement: true } } } } } });
          const current = await tx.importBatch.findUniqueOrThrow({ where: { id: batchId } });
          for (const row of selected) {
            const block = row.source.block; let value;
            const candidate = effectiveCandidate(row.candidate as unknown as ImportCandidate, row.corrections as unknown as RowCorrections, row.source.period as unknown as KnownValue<string>, block);
            try { value = confirmationValue(candidate, block); } catch { continue; }
            const matches = await suggestions(tx, userId, value, originNamespace(current.format, current.configuration, block.metadata), candidate.externalId.state === 'confirmed' ? candidate.externalId.value : null);
            if (matches.some(match => match.reason === 'external')) continue;
            const compatible = matches.filter(match => match.compatible);
            if (!compatible.length || all.reconcile === 'link' && (compatible.length !== 1 || matches.length >= 5)) continue;
            const target = compatible[0]!; const link = all.reconcile === 'link';
            await tx.importRow.update({ where: { id: row.id }, data: { action: link ? 'link' : 'create',
              ...(block.kind === 'bank' ? link ? { linkBankEntryId: target.id } : { distinctBankEntryId: target.id } : link ? { linkCardChargeId: target.id } : { distinctCardChargeId: target.id }) } });
            resolved.push({ id: row.id, action: link ? 'link' : 'distinct', recordId: target.id });
          }
        }
      }
      const rowIds = new Set<string>();
      for (const value of (data.rows ?? []) as unknown[]) {
        const patch = object(value, ['id', 'selected', 'corrections', 'reason', 'action', 'existingId', 'distinctFrom']); const rowId = id(patch.id);
        for (const field of ['existingId', 'distinctFrom']) if (patch[field] !== undefined && patch[field] !== null) id(patch[field]);
        if (rowIds.has(rowId)) fail(400, 'DUPLICATE_ROW', 'Linha repetida na alteração.'); rowIds.add(rowId);
        const row = await tx.importRow.findFirst({ where: { id: rowId, batchId, userId }, include: { source: { include: { block: true } } } });
        if (!row) fail(404, 'ROW_NOT_FOUND', 'Linha não encontrada.');
        if (patch.selected !== undefined && typeof patch.selected !== 'boolean') fail(400, 'INVALID_SELECTION', 'Seleção inválida.');
        if (patch.reason !== undefined && (typeof patch.reason !== 'string' || patch.reason.length > 500)) fail(400, 'INVALID_REASON', 'Motivo inválido.');
        let corrections = row.corrections as unknown as RowCorrections;
        if (patch.corrections !== undefined) {
          try { corrections = changeCorrections(corrections, patch.corrections, decisionId); } catch { fail(400, 'INVALID_CORRECTIONS', 'Confira data, descrição, centavos e parcelas.'); }
        }
        const selected = patch.action === 'skip' ? false : patch.action ? true : patch.selected === undefined ? row.selected : patch.selected;
        const action = selected ? patch.action as string ?? (row.action === 'skip' ? 'create' : row.action) : 'skip';
        if (!['create', 'link', 'skip'].includes(action) || patch.selected === false && patch.action && patch.action !== 'skip') fail(400, 'INVALID_DECISION', 'Decisão inválida.');
        const links = { linkBankEntryId: row.linkBankEntryId, linkCardChargeId: row.linkCardChargeId, distinctBankEntryId: row.distinctBankEntryId, distinctCardChargeId: row.distinctCardChargeId };
        if (!selected || patch.action !== undefined) { for (const field of Object.keys(links) as (keyof typeof links)[]) links[field] = null; }
        if (patch.existingId !== undefined && action !== 'link' || patch.distinctFrom !== undefined && action !== 'create') fail(400, 'INVALID_DECISION', 'Escolha vincular ou manter separada.');
        const targetId = action === 'link' ? patch.existingId ?? links.linkBankEntryId ?? links.linkCardChargeId : patch.distinctFrom;
        if (action === 'link' && !targetId) fail(400, 'LINK_REQUIRED', 'Escolha um registro para vincular.');
        if (targetId) {
          const target = await findRecord(tx, userId, row.source.block.kind, id(targetId));
          if (!target) fail(404, 'RECORD_NOT_FOUND', 'Registro não encontrado.');
          if (row.source.block.kind === 'bank') { if (action === 'link') links.linkBankEntryId = target.id; else links.distinctBankEntryId = target.id; }
          else { if (action === 'link') links.linkCardChargeId = target.id; else links.distinctCardChargeId = target.id; }
        }
        await tx.importRow.update({ where: { id: rowId }, data: { ...links, corrections: json(corrections), selected, action,
          reason: selected ? null : patch.reason as string ?? row.reason ?? 'Excluída na revisão' } });
      }
      await tx.importReviewRevision.create({ data: { id: decisionId, batchId, userId, version: expectedVersion + 1, changes: json({ ...data, ...(resolved.length ? { resolved } : {}) }) } });
      return { id: batchId, version: expectedVersion + 1 };
    }, { timeout: 60000 });
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
  async purgeFile(userId: string, batchId: string, body: unknown) {
    const expectedVersion = version(object(body, ['expectedVersion']).expectedVersion); await this.get(userId, batchId);
    return this.db.$transaction(async tx => {
      const result = await tx.importBatch.updateMany({ where: { id: batchId, userId, status: 'confirmed', version: expectedVersion, size: { gt: 0 } }, data: { size: 0, version: { increment: 1 } } });
      if (result.count !== 1) fail(409, 'FILE_REMOVAL_CONFLICT', 'Atualize o lote confirmado antes de remover o arquivo original.');
      await tx.importFile.deleteMany({ where: { batchId, userId } });
      await tx.importReviewRevision.create({ data: { batchId, userId, version: expectedVersion + 1, changes: { action: 'remove_original_file' } } });
      return { id: batchId, version: expectedVersion + 1 };
    });
  }
}
