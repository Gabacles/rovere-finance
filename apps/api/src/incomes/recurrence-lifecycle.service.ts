import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { allocatedTotal, assertIncomeReceiptChange, changeIncomeFacts, incomeTransition, incomeKnowledge, normalizeIncomePatch, normalizeIncomeRecurrence, normalizeRecurrenceChange, occurrenceChangeDisposition, recurrenceTransition, scheduledIncomeCandidate, scheduleInPeriod, parseCents, toMoneyDTO } from '@rovere/domain';
import type { IncomeDTO, IncomePatch, RecurrenceChange, RecurrenceSchedule } from '@rovere/domain';
import type { Database } from '../database.js';
import { DATABASE } from '../accounts/accounts.controller.js';
import { fail, json, key, object, version } from '../imports/validation.js';
import { incomeDetails, incomeStorage } from './incomes.service.js';
import { civil, digest, ruleDetails, today } from './recurrence-projection.js';
import type { Tx } from './recurrence-projection.js';

function changeInput(body: unknown): RecurrenceChange { try { return normalizeRecurrenceChange(body); } catch { fail(400, 'INVALID_RECURRENCE_CHANGE', 'Confira ação, competência inicial e dados da programação.'); } }
function expected(value: unknown) { const result = version(value); if (result >= 2147483647) fail(400, 'INVALID_VERSION', 'Versão inválida.'); return result; }
function confirmed(body: unknown, individual = false) {
  const data = object(body, ['action', ...(individual ? ['patch', 'expectedIncomeVersion'] : ['fromPeriod', 'input']), 'expectedVersion', 'previewHash', 'changeConfirmed']);
  if (data.changeConfirmed !== true || typeof data.previewHash !== 'string' || !/^[a-f0-9]{64}$/.test(data.previewHash)) fail(400, 'RECURRENCE_CONFIRMATION_REQUIRED', 'Revise a prévia e confirme a alteração.');
  const { expectedVersion, expectedIncomeVersion, previewHash, changeConfirmed: _confirmed, ...change } = data;
  return { expectedVersion: expected(expectedVersion), ...(individual ? { expectedIncomeVersion: expected(expectedIncomeVersion) } : {}), previewHash, change };
}
function individualInput(body: unknown): { action: 'edit' | 'cancel'; patch: IncomePatch } {
  const data = object(body, ['action', 'patch']);
  if (data.action === 'cancel' && data.patch === undefined) return { action: 'cancel', patch: {} };
  if (data.action !== 'edit') fail(400, 'INVALID_RECURRENCE_CHANGE', 'Ação de ocorrência inválida.');
  try { return { action: 'edit', patch: normalizeIncomePatch(data.patch) }; } catch { fail(400, 'INVALID_INCOME', 'Confira descrição, data e valor previsto em BRL.'); }
}
async function seriesPreview(tx: Tx, userId: string, id: string, change: RecurrenceChange) {
  const rule = await ruleDetails(tx, userId, id); const asOf = today(); let nextState: typeof rule.state;
  try { nextState = recurrenceTransition(rule.state, change.action); } catch { fail(409, 'RECURRENCE_STATE_CONFLICT', 'Esta ação não é permitida no estado atual da regra.'); }
  const rows: { income: IncomeDTO; period: string; disposition: string; patch: IncomePatch | null }[] = [];
  if (change.action === 'edit') {
    if (change.fromPeriod < asOf.slice(0, 7)) fail(400, 'RECURRENCE_FUTURE_REQUIRED', 'Escolha o mês atual ou um mês futuro para a programação.');
    let input; try { input = normalizeIncomeRecurrence({ ...change.input, startsOn: rule.startsOn }); } catch { fail(400, 'INVALID_RECURRENCE_CHANGE', 'Confira a vigência da programação.'); }
    const revision: RecurrenceSchedule = { ...input, effectiveFrom: change.fromPeriod, version: rule.version + 1, evidence: { kind: 'user', decisionId: 'preview' } };
    const schedules = [...rule.schedules, revision];
    const occurrences = await tx.scheduledOccurrence.findMany({ where: { userId, ruleId: id }, include: { exception: true, income: { include: { settlements: { where: { reversedAt: null }, select: { id: true } } } } }, orderBy: { period: 'asc' } });
    for (const row of occurrences) {
      const income = await incomeDetails(tx, userId, row.incomeId);
      let disposition: string = occurrenceChangeDisposition({ period: row.period, expectedOn: row.income.expectedOn ? civil(row.income.expectedOn) : null, state: income.state, exception: Boolean(row.exception), received: row.income.settlements.length > 0 }, change.fromPeriod, asOf);
      const candidate = scheduledIncomeCandidate(schedules, row.period);
      if (disposition === 'update' && scheduleInPeriod(schedules, row.period).version !== revision.version) disposition = 'later_schedule';
      if (disposition === 'update' && !candidate.eligible) disposition = 'outside_rule';
      if (disposition === 'update' && candidate.expectedOn <= asOf) disposition = 'past';
      rows.push({ income, period: row.period, disposition, patch: disposition === 'update' ? { description: input.description, notes: input.notes, facts: { expectedOn: candidate.expectedOn, expectedAmount: candidate.amount } } : null });
    }
  }
  const counts = { update: rows.filter(row => row.disposition === 'update').length, preserve: change.action === 'edit' ? rows.filter(row => row.disposition !== 'update').length : rule.occurrenceCount };
  const result = { rule, asOf, change, nextState, rows, counts }; return { ...result, previewHash: digest(result) };
}
async function occurrencePreview(tx: Tx, userId: string, id: string, incomeId: string, change: ReturnType<typeof individualInput>) {
  const rule = await ruleDetails(tx, userId, id);
  const row = await tx.scheduledOccurrence.findFirst({ where: { incomeId, userId, ruleId: id }, include: { exception: true } });
  if (!row) fail(404, 'RECURRENCE_OCCURRENCE_NOT_FOUND', 'Ocorrência não encontrada nesta regra.');
  const income = await incomeDetails(tx, userId, incomeId);
  const receipts = await tx.incomeSettlement.findMany({ where: { userId, incomeId, reversedAt: null }, select: { id: true, bankEntryId: true, cents: true } });
  const received = allocatedTotal(receipts.map(item => toMoneyDTO(parseCents(item.cents.toString()))));
  try { incomeTransition(income.state, change.action); assertIncomeReceiptChange(change.action, received, change.patch.facts?.expectedAmount); }
  catch { fail(409, 'RECURRENCE_OCCURRENCE_REVIEW_REQUIRED', 'Revise os recebimentos: não é possível cancelar, limpar ou reduzir abaixo do recebido; ocorrência cancelada é definitiva.'); }
  const nextFacts = changeIncomeFacts(income.facts, change.patch.facts, 'preview');
  const next = { ...income, knowledge: incomeKnowledge(nextFacts), ...(change.patch.description === undefined ? {} : { description: change.patch.description }), ...(change.patch.notes === undefined ? {} : { notes: change.patch.notes }), state: incomeTransition(income.state, change.action), facts: nextFacts };
  const result = { rule, income, next, change, received, receipts: receipts.map(item => ({ id: item.id, bankEntryId: item.bankEntryId, amount: toMoneyDTO(parseCents(item.cents.toString())) })), exception: Boolean(row.exception) };
  return { ...result, previewHash: digest(result) };
}
async function updateIncome(tx: Tx, userId: string, income: IncomeDTO, action: 'edit' | 'cancel', patch: IncomePatch, decisionId: string) {
  if (income.version >= 2147483647) fail(409, 'INCOME_VERSION_CONFLICT', 'Versão da ocorrência esgotada.');
  const updated = await tx.income.updateMany({ where: { id: income.id, userId, version: income.version }, data: { ...(patch.description === undefined ? {} : { description: patch.description }), ...(patch.notes === undefined ? {} : { notes: patch.notes }), ...incomeStorage(changeIncomeFacts(income.facts, patch.facts, decisionId)), state: incomeTransition(income.state, action), version: { increment: 1 } } });
  if (updated.count !== 1) fail(409, 'INCOME_VERSION_CONFLICT', 'A ocorrência mudou. Consulte nova prévia.');
  const current = await incomeDetails(tx, userId, income.id);
  await tx.incomeCommand.create({ data: { userId, incomeId: income.id, key: randomUUID(), requestHash: digest({ decisionId, incomeId: income.id }), version: current.version, changes: json({ action, patch, previous: income, current, recurrenceDecisionId: decisionId }), result: json(current) } });
  return current;
}
@Injectable()
export class RecurrenceLifecycleService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async occurrences(userId: string, id: string, query: unknown) {
    const data = object(query, ['page']); if (data.page !== undefined && (typeof data.page !== 'string' || !/^[1-9]\d{0,4}$/.test(data.page))) fail(400, 'INVALID_QUERY', 'Página inválida.'); const page = Number(data.page ?? 1);
    return this.db.$transaction(async tx => { const rule = await ruleDetails(tx, userId, id); const found = await tx.scheduledOccurrence.findMany({ where: { ruleId: id, userId }, orderBy: { period: 'asc' }, skip: (page - 1) * 25, take: 25, include: { exception: true } }); const rows = []; for (const row of found) rows.push({ period: row.period, originalExpectedOn: civil(row.expectedOn), originalAmount: toMoneyDTO(parseCents(row.cents.toString())), exception: Boolean(row.exception), income: await incomeDetails(tx, userId, row.incomeId) }); return { page, total: rule.occurrenceCount, rows }; }, { isolationLevel: 'RepeatableRead' });
  }
  preview(userId: string, id: string, body: unknown) { const change = changeInput(body); return this.db.$transaction(tx => seriesPreview(tx, userId, id, change), { isolationLevel: 'RepeatableRead', timeout: 60000 }); }
  occurrencePreview(userId: string, id: string, incomeId: string, body: unknown) { const change = individualInput(body); return this.db.$transaction(tx => occurrencePreview(tx, userId, id, incomeId, change), { isolationLevel: 'RepeatableRead' }); }
  change(userId: string, id: string, body: unknown, token: unknown) { const data = confirmed(body); return this.command(userId, id, null, { ...data, change: changeInput(data.change) }, key(token)); }
  occurrenceChange(userId: string, id: string, incomeId: string, body: unknown, token: unknown) { const data = confirmed(body, true); return this.command(userId, id, incomeId, { ...data, change: individualInput(data.change) }, key(token)); }
  private command(userId: string, id: string, incomeId: string | null, data: ReturnType<typeof confirmed> & { change: RecurrenceChange | ReturnType<typeof individualInput> }, token: string) {
    const requestHash = digest({ id, incomeId, ...data });
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const replay = await tx.recurrenceCommand.findUnique({ where: { userId_key: { userId, key: token } } });
      if (replay) { if (replay.requestHash !== requestHash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Chave já usada com outros dados.'); await ruleDetails(tx, userId, replay.ruleId); return replay.result; }
      const decisionId = randomUUID(); const evidence = { kind: 'user', decisionId };
      const before = incomeId ? await occurrencePreview(tx, userId, id, incomeId, data.change as ReturnType<typeof individualInput>) : await seriesPreview(tx, userId, id, data.change as RecurrenceChange);
      if (before.rule.version !== data.expectedVersion || ('income' in before && before.income.version !== data.expectedIncomeVersion)) fail(409, 'RECURRENCE_VERSION_CONFLICT', 'A regra ou ocorrência mudou. Consulte nova prévia.');
      if (before.previewHash !== data.previewHash) fail(409, 'RECURRENCE_PREVIEW_CHANGED', 'A prévia mudou. Revise novamente antes de confirmar.');
      let currentIncome: IncomeDTO | null = null;
      if ('income' in before) {
        currentIncome = await updateIncome(tx, userId, before.income, before.change.action, before.change.patch, decisionId);
        if (!before.exception) await tx.recurrenceException.create({ data: { incomeId: before.income.id, ruleId: id, userId, evidence: json(evidence) } });
        await tx.recurrenceRule.update({ where: { id_userId: { id, userId } }, data: { version: { increment: 1 } } });
      } else {
        const change = before.change;
        if (change.action === 'edit') {
          const input = normalizeIncomeRecurrence({ ...change.input, startsOn: before.rule.startsOn });
          await tx.recurrenceRevision.create({ data: { userId, ruleId: id, version: before.rule.version + 1, effectiveFrom: change.fromPeriod, description: input.description, notes: input.notes, cents: BigInt(input.amount.cents), anchorDay: input.anchorDay, startsOn: new Date(`${input.startsOn}T00:00:00Z`), endsOn: input.endsOn ? new Date(`${input.endsOn}T00:00:00Z`) : null, evidence: json(evidence) } });
          for (const row of before.rows) if (row.patch) await updateIncome(tx, userId, row.income, 'edit', row.patch, decisionId);
          await tx.recurrenceRule.update({ where: { id_userId: { id, userId } }, data: { description: input.description, notes: input.notes, cents: BigInt(input.amount.cents), anchorDay: input.anchorDay, endsOn: input.endsOn ? new Date(`${input.endsOn}T00:00:00Z`) : null, version: { increment: 1 } } });
        } else await tx.recurrenceRule.update({ where: { id_userId: { id, userId } }, data: { state: before.nextState, version: { increment: 1 } } });
      }
      const rule = await ruleDetails(tx, userId, id); const result = { rule, income: currentIncome, ...( 'counts' in before ? { counts: before.counts } : {}) };
      await tx.recurrenceCommand.create({ data: { id: decisionId, userId, ruleId: id, key: token, requestHash, version: rule.version, changes: json({ action: incomeId ? `${data.change.action}_occurrence` : data.change.action, request: data, previous: before, current: result }), result: json(result) } }); return result;
    }, { timeout: 60000 });
  }
}
