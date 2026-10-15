import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { monthlyIncomeCandidates, normalizeGenerationRange, normalizeIncomeRecurrence, parseCivilDate, parseCents, toMoneyDTO } from '@rovere/domain';
import type { GenerationRange, IncomeRecurrenceDTO, IncomeRecurrenceInput, Evidence } from '@rovere/domain';
import type { Prisma } from '../generated/prisma/client.js';
import type { Database } from '../database.js';
import { DATABASE } from '../accounts/accounts.controller.js';
import { fail, json, key, object, version } from '../imports/validation.js';
import { incomeDetails } from './incomes.service.js';

type Tx = Prisma.TransactionClient;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const civil = (value: Date) => parseCivilDate(value.toISOString().slice(0, 10));
type RuleRow = Prisma.RecurrenceRuleGetPayload<{ include: { _count: { select: { occurrences: true } } } }>;
function ruleDTO(row: RuleRow): IncomeRecurrenceDTO {
  return { id: row.id, version: row.version, cadence: 'monthly', description: row.description, notes: row.notes, amount: toMoneyDTO(parseCents(row.cents.toString())),
    anchorDay: row.anchorDay, startsOn: civil(row.startsOn), endsOn: row.endsOn ? civil(row.endsOn) : null, evidence: row.evidence as unknown as Evidence, occurrenceCount: row._count.occurrences };
}
async function ruleDetails(tx: Tx | Database, userId: string, id: string): Promise<IncomeRecurrenceDTO> {
  const row = await tx.recurrenceRule.findUnique({ where: { id_userId: { id, userId } }, include: { _count: { select: { occurrences: true } } } });
  if (!row) fail(404, 'RECURRENCE_NOT_FOUND', 'Regra de receita não encontrada.');
  return ruleDTO(row);
}
function rangeInput(value: unknown): GenerationRange { try { return normalizeGenerationRange(value); } catch { fail(400, 'INVALID_GENERATION_RANGE', 'Informe intervalo mensal válido, ordenado e de até 120 meses.'); } }
async function preview(tx: Tx, userId: string, ruleId: string, range: GenerationRange) {
  const rule = await ruleDetails(tx, userId, ruleId); const candidates = monthlyIncomeCandidates(rule, range);
  const existing = await tx.scheduledOccurrence.findMany({ where: { userId, ruleId, period: { in: candidates.map(row => row.period) } }, include: { income: { select: { state: true } } } });
  const byPeriod = new Map(existing.map(row => [row.period, row]));
  const rows = candidates.map(candidate => {
    const row = byPeriod.get(candidate.period);
    return { period: candidate.period, expectedOn: candidate.expectedOn, amount: candidate.amount, state: row ? 'existing' as const : candidate.eligible ? 'create' as const : 'outside_rule' as const,
      incomeId: row?.incomeId ?? null, incomeState: row ? row.income.state as 'planned' | 'cancelled' : null };
  });
  const counts = { create: rows.filter(row => row.state === 'create').length, existing: rows.filter(row => row.state === 'existing').length, outsideRule: rows.filter(row => row.state === 'outside_rule').length };
  return { rule, range, counts, rows, previewHash: digest({ rule, range, rows }) };
}
type Decision = { action: 'create'; input: IncomeRecurrenceInput } | { action: 'generate'; ruleId: string; expectedVersion: number; range: GenerationRange; previewHash: string; generationConfirmed: true };
@Injectable()
export class IncomeRecurrencesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  get(userId: string, id: string) { return ruleDetails(this.db, userId, id); }
  async list(userId: string, query: unknown) {
    const data = object(query, ['page']);
    if (data.page !== undefined && (typeof data.page !== 'string' || !/^[1-9]\d{0,4}$/.test(data.page))) fail(400, 'INVALID_QUERY', 'Página inválida.');
    const page = data.page ? Number(data.page) : 1;
    return this.db.$transaction(async tx => {
      const rows = await tx.recurrenceRule.findMany({ where: { userId }, include: { _count: { select: { occurrences: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 25 });
      return { page, total: await tx.recurrenceRule.count({ where: { userId } }), rows: rows.map(ruleDTO) };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async history(userId: string, id: string) {
    await this.get(userId, id);
    return this.db.recurrenceCommand.findMany({ where: { userId, ruleId: id }, select: { id: true, version: true, changes: true, createdAt: true }, orderBy: { version: 'desc' }, take: 20 });
  }
  preview(userId: string, id: string, body: unknown) { const range = rangeInput(body); return this.db.$transaction(tx => preview(tx, userId, id, range), { isolationLevel: 'RepeatableRead' }); }
  create(userId: string, body: unknown, token: unknown) {
    let input: IncomeRecurrenceInput;
    try { input = normalizeIncomeRecurrence(body); } catch { fail(400, 'INVALID_INCOME_RECURRENCE', 'Confira descrição, valor fixo BRL, dia âncora e início/fim explícitos da regra.'); }
    return this.command(userId, { action: 'create', input }, key(token));
  }
  generate(userId: string, id: string, body: unknown, token: unknown) {
    const data = object(body, ['expectedVersion', 'fromPeriod', 'toPeriod', 'previewHash', 'generationConfirmed']); const expectedVersion = version(data.expectedVersion);
    if (expectedVersion >= 2147483647) fail(400, 'INVALID_VERSION', 'Versão inválida.');
    if (data.generationConfirmed !== true || typeof data.previewHash !== 'string' || !/^[a-f0-9]{64}$/.test(data.previewHash)) fail(400, 'GENERATION_CONFIRMATION_REQUIRED', 'Confira a prévia e confirme explicitamente a geração.');
    return this.command(userId, { action: 'generate', ruleId: id, expectedVersion, range: rangeInput({ fromPeriod: data.fromPeriod, toPeriod: data.toPeriod }), previewHash: data.previewHash, generationConfirmed: true }, key(token));
  }
  private command(userId: string, decision: Decision, token: string) {
    const requestHash = digest(decision);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const replay = await tx.recurrenceCommand.findUnique({ where: { userId_key: { userId, key: token } } });
      if (replay) {
        if (replay.requestHash !== requestHash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outros dados.');
        await ruleDetails(tx, userId, replay.ruleId); return replay.result;
      }
      const decisionId = randomUUID(); const evidence = { kind: 'user' as const, decisionId };
      if (decision.action === 'create') {
        const input = decision.input;
        const row = await tx.recurrenceRule.create({ data: { userId, description: input.description, notes: input.notes, cents: BigInt(input.amount.cents), anchorDay: input.anchorDay,
          startsOn: new Date(`${input.startsOn}T00:00:00Z`), endsOn: input.endsOn ? new Date(`${input.endsOn}T00:00:00Z`) : null, evidence: json(evidence) } });
        const result = await ruleDetails(tx, userId, row.id);
        await tx.recurrenceCommand.create({ data: { id: decisionId, userId, ruleId: row.id, key: token, requestHash, version: 0, changes: json({ action: 'create', previous: null, current: result }), result: json(result) } }); return result;
      }
      const before = await preview(tx, userId, decision.ruleId, decision.range);
      if (before.rule.version !== decision.expectedVersion) fail(409, 'RECURRENCE_VERSION_CONFLICT', 'A regra mudou. Atualize a prévia antes de gerar.');
      if (before.previewHash !== decision.previewHash) fail(409, 'RECURRENCE_PREVIEW_CHANGED', 'As ocorrências mudaram. Atualize e revise a prévia.');
      const created: { occurrenceId: string; incomeId: string; period: string }[] = [];
      for (const row of before.rows.filter(row => row.state === 'create')) {
        const occurrenceId = randomUUID(); const origin = { kind: 'recurrence', decisionId, ruleId: decision.ruleId, occurrenceId };
        const income = await tx.income.create({ data: { userId, description: before.rule.description, notes: before.rule.notes, expectedOn: new Date(`${row.expectedOn}T00:00:00Z`),
          expectedAmount: BigInt(row.amount.cents), origin: json(origin), factEvidence: json({ expectedOn: evidence, expectedAmount: evidence }) } });
        await tx.scheduledOccurrence.create({ data: { id: occurrenceId, userId, ruleId: decision.ruleId, period: row.period, expectedOn: new Date(`${row.expectedOn}T00:00:00Z`), cents: BigInt(row.amount.cents), ruleVersion: before.rule.version, incomeId: income.id, evidence: json(evidence) } });
        const current = await incomeDetails(tx, userId, income.id);
        await tx.incomeCommand.create({ data: { id: randomUUID(), userId, incomeId: income.id, key: randomUUID(), requestHash: digest({ decisionId, occurrenceId, incomeId: income.id }), version: 0,
          changes: json({ action: 'generate', patch: {}, previous: null, current }), result: json(current) } });
        created.push({ occurrenceId, incomeId: income.id, period: row.period });
      }
      const changed = await tx.recurrenceRule.updateMany({ where: { id: decision.ruleId, userId, version: decision.expectedVersion }, data: { version: { increment: 1 } } });
      if (changed.count !== 1) fail(409, 'RECURRENCE_VERSION_CONFLICT', 'A regra mudou. Atualize a prévia antes de gerar.');
      const current = await preview(tx, userId, decision.ruleId, decision.range); const result = { rule: current.rule, created, preview: current };
      await tx.recurrenceCommand.create({ data: { id: decisionId, userId, ruleId: decision.ruleId, key: token, requestHash, version: current.rule.version,
        changes: json({ action: 'generate', request: decision, previous: before.rule, current: current.rule, result }), result: json(result) } }); return result;
    }, { timeout: 60000 });
  }
}
