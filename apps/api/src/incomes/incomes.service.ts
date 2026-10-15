import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { allocatedTotal, assertIncomeReceiptChange, changeIncomeFacts, IncomeError, IncomeSettlementError, incomeKnowledge, incomeTransition, normalizeIncomePatch, parseCivilDate, parseCents, toMoneyDTO, unknownIncomeFacts } from '@rovere/domain';
import type { Evidence, IncomeDTO, IncomeFacts, IncomePatch, KnownValue } from '@rovere/domain';
import type { Income, Prisma } from '../generated/prisma/client.js';
import { DATABASE } from '../accounts/accounts.controller.js';
import type { Database } from '../database.js';
import { fail, json, key, object, version } from '../imports/validation.js';

function facts(row: Income): IncomeFacts {
  const evidence = row.factEvidence as unknown as Partial<Record<keyof IncomeFacts, Evidence>>;
  const known = <T>(value: T | null, proof: Evidence | undefined): KnownValue<T> => {
    if (value === null) return { state: 'unknown' };
    if (!proof) throw new Error('INCOME_EVIDENCE_MISSING');
    return { state: 'confirmed', value, evidence: proof };
  };
  return { expectedOn: known(row.expectedOn ? parseCivilDate(row.expectedOn.toISOString().slice(0, 10)) : null, evidence.expectedOn),
    expectedAmount: known(row.expectedAmount === null ? null : toMoneyDTO(parseCents(row.expectedAmount.toString())), evidence.expectedAmount) };
}
function details(row: Income): IncomeDTO {
  const value = facts(row);
  return { id: row.id, version: row.version, description: row.description, notes: row.notes, state: row.state as IncomeDTO['state'],
    origin: row.origin as unknown as IncomeDTO['origin'], facts: value, knowledge: incomeKnowledge(value) };
}
function storage(value: IncomeFacts) {
  return { expectedOn: value.expectedOn.state === 'confirmed' ? new Date(`${value.expectedOn.value}T00:00:00.000Z`) : null,
    expectedAmount: value.expectedAmount.state === 'confirmed' ? BigInt(value.expectedAmount.value.cents) : null,
    factEvidence: json(Object.fromEntries(Object.entries(value).filter(([, fact]) => fact.state === 'confirmed').map(([field, fact]) => [field, fact.state === 'confirmed' ? fact.evidence : undefined]))) };
}
function normalize(body: unknown, creating: boolean): IncomePatch {
  try { return normalizeIncomePatch(body, creating); }
  catch (error) { fail(400, 'INVALID_INCOME', 'Confira descrição, data prevista e valor esperado não negativo em BRL.', [{ field: error instanceof IncomeError ? error.field : 'income', code: 'INVALID_INCOME' }]); }
}
function expected(value: unknown): number {
  const result = version(value);
  if (result >= 2147483647) fail(400, 'INVALID_VERSION', 'Versão inválida.');
  return result;
}
export async function incomeDetails(tx: Prisma.TransactionClient | Database, userId: string, id: string) {
  const row = await tx.income.findUnique({ where: { id_userId: { id, userId } } });
  if (!row) fail(404, 'INCOME_NOT_FOUND', 'Previsão de receita não encontrada.');
  return details(row);
}
@Injectable()
export class IncomesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  get(userId: string, id: string) { return incomeDetails(this.db, userId, id); }
  async list(userId: string, query: unknown) {
    const data = object(query, ['page']);
    if (data.page !== undefined && (typeof data.page !== 'string' || !/^[1-9]\d{0,4}$/.test(data.page))) fail(400, 'INVALID_QUERY', 'Página inválida.');
    const page = data.page ? Number(data.page) : 1;
    const rows = await this.db.income.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 25 });
    return { page, total: await this.db.income.count({ where: { userId } }), rows: rows.map(details) };
  }
  async history(userId: string, id: string) {
    await this.get(userId, id);
    return this.db.incomeCommand.findMany({ where: { incomeId: id, userId }, select: { id: true, version: true, changes: true, createdAt: true }, orderBy: { version: 'desc' }, take: 20 });
  }
  create(userId: string, body: unknown, token: unknown) { return this.command(userId, null, 'create', normalize(body, true), null, key(token)); }
  update(userId: string, id: string, body: unknown, token: unknown) {
    const data = object(body, ['expectedVersion', 'description', 'notes', 'facts']);
    const expectedVersion = expected(data.expectedVersion); const { expectedVersion: _version, ...patch } = data;
    return this.command(userId, id, 'edit', normalize(patch, false), expectedVersion, key(token));
  }
  cancel(userId: string, id: string, body: unknown, token: unknown) {
    const data = object(body, ['expectedVersion']);
    return this.command(userId, id, 'cancel', {}, expected(data.expectedVersion), key(token));
  }
  private async command(userId: string, incomeId: string | null, action: 'create' | 'edit' | 'cancel', patch: IncomePatch, expectedVersion: number | null, token: string) {
    const hash = createHash('sha256').update(JSON.stringify({ incomeId, action, expectedVersion, patch })).digest('hex');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const replay = await tx.incomeCommand.findUnique({ where: { userId_key: { userId, key: token } } });
      if (replay) {
        if (replay.requestHash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outros dados.');
        // Authorization is scoped to the current session owner even for old snapshots.
        await incomeDetails(tx, userId, replay.incomeId);
        return replay.result as unknown as IncomeDTO;
      }
      const decisionId = randomUUID(); let previous: IncomeDTO | null = null;
      if (incomeId === null) {
        const row = await tx.income.create({ data: { userId, description: patch.description!, notes: patch.notes ?? null,
          origin: json({ kind: 'manual', decisionId }), ...storage(changeIncomeFacts(unknownIncomeFacts(), patch.facts, decisionId)) } }); incomeId = row.id;
      } else {
        previous = await incomeDetails(tx, userId, incomeId);
        if (previous.version !== expectedVersion) fail(409, 'INCOME_VERSION_CONFLICT', 'A previsão mudou. Recarregue os dados antes de confirmar.');
        if (previous.origin.kind === 'recurrence') fail(409, 'RECURRENCE_OCCURRENCE_LOCKED', 'Esta previsão veio de uma regra. Revisão de ocorrência e de série estará disponível na RF-030; origem e recebimentos foram preservados.');
        let state: IncomeDTO['state'];
        try { state = incomeTransition(previous.state, action === 'cancel' ? 'cancel' : 'edit'); }
        catch { fail(409, 'INCOME_CANCELLED', 'A previsão foi cancelada. Cadastre uma nova previsão para planejar outra receita.'); }
        const active = await tx.incomeSettlement.findMany({ where: { incomeId, userId, reversedAt: null }, select: { cents: true } });
        try { assertIncomeReceiptChange(action === 'cancel' ? 'cancel' : 'edit', allocatedTotal(active.map(row => toMoneyDTO(parseCents(row.cents.toString())))), patch.facts?.expectedAmount); }
        catch (error) { fail(409, error instanceof IncomeSettlementError ? error.code : 'INCOME_RECEIPTS_REVIEW_REQUIRED', 'Revise explicitamente os recebimentos vinculados antes de cancelar, limpar ou reduzir o previsto abaixo do já recebido. Histórico e movimentos foram preservados.'); }
        const updated = await tx.income.updateMany({ where: { id: incomeId, userId, version: expectedVersion! }, data: {
          ...(patch.description === undefined ? {} : { description: patch.description }), ...(patch.notes === undefined ? {} : { notes: patch.notes }),
          ...storage(changeIncomeFacts(previous.facts, patch.facts, decisionId)), state, version: { increment: 1 } } });
        if (updated.count !== 1) fail(409, 'INCOME_VERSION_CONFLICT', 'A previsão mudou. Recarregue os dados antes de confirmar.');
      }
      const result = await incomeDetails(tx, userId, incomeId);
      await tx.incomeCommand.create({ data: { id: decisionId, userId, incomeId, key: token, requestHash: hash, version: result.version,
        changes: json({ action, patch, previous, current: result }), result: json(result) } });
      return result;
    });
  }
}
