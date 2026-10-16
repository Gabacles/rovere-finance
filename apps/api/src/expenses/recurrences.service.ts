import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { normalizeExpenseRecurrence, normalizeExpenseRecurrenceOperation, scheduleInPeriod, toMoneyDTO, parseCents } from '@rovere/domain';
import type { ExpenseDTO, ExpenseRecurrenceInput, ExpenseRecurrenceOperation } from '@rovere/domain';
import type { Database } from '../database.js';
import { DATABASE } from '../accounts/accounts.controller.js';
import { fail, json, key, object, version } from '../imports/validation.js';
import { expenseDetails } from './expenses.service.js';
import { civil, digest, expensePreview, include, occurrenceDetails, occurrenceDTO, ruleDetails, ruleDTO } from './recurrence-projection.js';
import type { Tx } from './recurrence-projection.js';

function pageInput(query: unknown) { const data = object(query, ['page']); if (data.page !== undefined && (typeof data.page !== 'string' || !/^[1-9]\d{0,4}$/.test(data.page))) fail(400, 'INVALID_QUERY', 'Página inválida.'); return Number(data.page ?? 1); }
function expected(value: unknown) { const result = version(value); if (result >= 2147483647) fail(400, 'INVALID_VERSION', 'Versão inválida.'); return result; }
function operationInput(body: unknown): ExpenseRecurrenceOperation { try { return normalizeExpenseRecurrenceOperation(body); } catch { fail(400, 'INVALID_EXPENSE_RECURRENCE_OPERATION', 'Confira ação, competência, datas e valores confirmados em BRL.'); } }
type Decision = { action: 'create'; input: ExpenseRecurrenceInput } | { action: 'confirm'; id: string; operation: ExpenseRecurrenceOperation; expectedVersion: number; expectedOccurrenceVersion: number | null; previewHash: string; confirmed: true };
const date = (value: string) => new Date(`${value}T00:00:00Z`);
@Injectable()
export class ExpenseRecurrencesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  get(userId: string, id: string) { return ruleDetails(this.db, userId, id); }
  async list(userId: string, query: unknown) {
    const page = pageInput(query); return this.db.$transaction(async tx => ({ page, total: await tx.expenseRecurrence.count({ where: { userId } }),
      rows: (await tx.expenseRecurrence.findMany({ where: { userId }, include, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 25 })).map(ruleDTO) }), { isolationLevel: 'RepeatableRead' });
  }
  async occurrences(userId: string, id: string, query: unknown) {
    const page = pageInput(query); return this.db.$transaction(async tx => {
      const rule = await ruleDetails(tx, userId, id); const rows = []; for (const row of await tx.expenseOccurrence.findMany({ where: { ruleId: id, userId }, orderBy: { period: 'asc' }, skip: (page - 1) * 25, take: 25 })) rows.push(await occurrenceDTO(tx, userId, row));
      return { page, total: rule.occurrenceCount, rows };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async history(userId: string, id: string) { await this.get(userId, id); return this.db.expenseRecurrenceCommand.findMany({ where: { userId, ruleId: id }, select: { id: true, version: true, changes: true, createdAt: true }, orderBy: { version: 'desc' }, take: 20 }); }
  preview(userId: string, id: string, body: unknown) { const operation = operationInput(body); return this.db.$transaction(tx => expensePreview(tx, userId, id, operation), { isolationLevel: 'RepeatableRead', timeout: 60000 }); }
  create(userId: string, body: unknown, token: unknown) {
    let input: ExpenseRecurrenceInput; try { input = normalizeExpenseRecurrence(body); } catch { fail(400, 'INVALID_EXPENSE_RECURRENCE', 'Confira descrição, valor mensal fixo, âncora e vigência explícita.'); }
    return this.command(userId, { action: 'create', input }, key(token));
  }
  confirm(userId: string, id: string, body: unknown, token: unknown) {
    const data = object(body, ['operation', 'expectedVersion', 'expectedOccurrenceVersion', 'previewHash', 'confirmed']); const operation = operationInput(data.operation);
    if (data.confirmed !== true || typeof data.previewHash !== 'string' || !/^[a-f0-9]{64}$/.test(data.previewHash)) fail(400, 'RECURRENCE_CONFIRMATION_REQUIRED', 'Revise a prévia e confirme explicitamente.');
    const individual = 'occurrenceId' in operation;
    if (!individual && data.expectedOccurrenceVersion !== undefined) fail(400, 'INVALID_VERSION', 'Versão de ocorrência só se aplica à ação individual.');
    return this.command(userId, { action: 'confirm', id, operation, expectedVersion: expected(data.expectedVersion), expectedOccurrenceVersion: individual ? expected(data.expectedOccurrenceVersion) : null, previewHash: data.previewHash, confirmed: true }, key(token));
  }
  private command(userId: string, decision: Decision, token: string) {
    const requestHash = digest(decision);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const replay = await tx.expenseRecurrenceCommand.findUnique({ where: { userId_key: { userId, key: token } } });
      if (replay) { if (replay.requestHash !== requestHash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Chave já usada com outros dados.'); await ruleDetails(tx, userId, replay.ruleId); return replay.result; }
      const decisionId = randomUUID(); const evidence = { kind: 'user' as const, decisionId };
      if (decision.action === 'create') {
        const input = decision.input; const fields = { description: input.description, notes: input.notes, cents: BigInt(input.amount.cents), anchorDay: input.anchorDay, startsOn: date(input.startsOn), endsOn: input.endsOn ? date(input.endsOn) : null };
        const row = await tx.expenseRecurrence.create({ data: { userId, ...fields, evidence: json(evidence) } });
        await tx.expenseRecurrenceRevision.create({ data: { userId, ruleId: row.id, ...fields, effectiveFrom: '0001-01', version: 0, evidence: json(evidence) } });
        const result = await ruleDetails(tx, userId, row.id);
        await tx.expenseRecurrenceCommand.create({ data: { id: decisionId, userId, ruleId: row.id, key: token, requestHash, version: 0, changes: json({ action: 'create', previous: null, current: result }), result: json(result) } }); return result;
      }
      const before = await expensePreview(tx, userId, decision.id, decision.operation);
      if (before.rule.version !== decision.expectedVersion || (before.occurrence && before.occurrence.version !== decision.expectedOccurrenceVersion)) fail(409, 'RECURRENCE_VERSION_CONFLICT', 'A regra ou ocorrência mudou. Consulte nova prévia.');
      if (before.previewHash !== decision.previewHash) fail(409, 'RECURRENCE_PREVIEW_CHANGED', 'A prévia mudou. Revise novamente.');
      const operation = decision.operation; let nextState = before.rule.state;
      if (operation.action === 'generate') {
        if (before.rule.state !== 'active') fail(409, 'RECURRENCE_INACTIVE', 'Regra pausada ou cancelada. Nenhuma previsão gerada.');
        for (const row of before.rows.filter(row => row.disposition === 'create')) {
          const schedule = scheduleInPeriod(before.rule.schedules, row.period);
          await tx.expenseOccurrence.create({ data: { userId, ruleId: decision.id, period: row.period, description: schedule.description, notes: schedule.notes,
            originalExpectedOn: date(row.expectedOn), originalCents: BigInt(row.amount.cents), ruleVersion: before.rule.version, expectedOn: date(row.expectedOn), cents: BigInt(row.amount.cents), evidence: json(evidence) } });
        }
      } else if (operation.action === 'edit_series') {
        const input = normalizeExpenseRecurrence({ ...operation.input, startsOn: before.rule.startsOn });
        await tx.expenseRecurrenceRevision.create({ data: { userId, ruleId: decision.id, version: before.rule.version + 1, effectiveFrom: operation.fromPeriod, description: input.description, notes: input.notes, cents: BigInt(input.amount.cents), anchorDay: input.anchorDay, startsOn: date(input.startsOn), endsOn: input.endsOn ? date(input.endsOn) : null, evidence: json(evidence) } });
        for (const row of before.rows.filter(row => row.disposition === 'update')) await updateOccurrence(tx, userId, row.occurrence!.id, row.occurrence!.version, { description: input.description, notes: input.notes, cents: BigInt(row.amount.cents), expectedOn: date(row.expectedOn) });
      } else if (operation.action === 'pause' || operation.action === 'resume' || operation.action === 'cancel_series') nextState = operation.action === 'pause' ? 'paused' : operation.action === 'resume' ? 'active' : 'cancelled';
      else {
        const current = before.occurrence!;
        if (operation.action === 'edit_occurrence') await updateOccurrence(tx, userId, current.id, current.version, { description: operation.input.description, notes: operation.input.notes, expectedOn: date(operation.input.expectedOn), cents: BigInt(operation.input.amount.cents), individual: true });
        else if (operation.action === 'cancel_occurrence') await updateOccurrence(tx, userId, current.id, current.version, { state: 'cancelled', individual: true });
        else {
          let expense = before.expense;
          if (operation.action === 'record') {
            const patch = operation.expense;
            const row = await tx.expense.create({ data: { userId, description: patch.description!, notes: patch.notes ?? null, purchasedOn: date(patch.facts!.purchasedOn!), total: BigInt(patch.facts!.total!.cents), factEvidence: json({ purchasedOn: evidence, total: evidence }) } });
            expense = await expenseDetails(tx, userId, row.id);
            await expenseJournal(tx, userId, expense, null, decisionId, decision.id, current.id);
          } else if (operation.action === 'link') {
            const previous = expense!;
            if (previous.version >= 2147483647) fail(409, 'EXPENSE_VERSION_CONFLICT', 'Versão da despesa esgotada.');
            const changed = await tx.expense.updateMany({ where: { id: previous.id, userId, version: previous.version }, data: { version: { increment: 1 } } });
            if (changed.count !== 1) fail(409, 'EXPENSE_VERSION_CONFLICT', 'Despesa mudou. Atualize a prévia.');
            expense = await expenseDetails(tx, userId, previous.id);
            await expenseJournal(tx, userId, expense, previous, decisionId, decision.id, current.id);
          }
          await updateOccurrence(tx, userId, current.id, current.version, { state: 'recorded', expenseId: expense!.id, confirmation: json(expense!) });
        }
      }
      const fields = operation.action === 'edit_series' ? { description: operation.input.description, notes: operation.input.notes, cents: BigInt(operation.input.amount.cents), anchorDay: operation.input.anchorDay, endsOn: operation.input.endsOn ? date(operation.input.endsOn) : null } : {};
      const changed = await tx.expenseRecurrence.updateMany({ where: { id: decision.id, userId, version: decision.expectedVersion }, data: { ...fields, state: nextState, version: { increment: 1 } } });
      if (changed.count !== 1) fail(409, 'RECURRENCE_VERSION_CONFLICT', 'Regra mudou. Atualize a prévia.');
      const result = { rule: await ruleDetails(tx, userId, decision.id), occurrence: before.occurrence ? await occurrenceDetails(tx, userId, decision.id, before.occurrence.id) : null, counts: before.counts };
      await tx.expenseRecurrenceCommand.create({ data: { id: decisionId, userId, ruleId: decision.id, key: token, requestHash, version: result.rule.version, changes: json({ action: operation.action, request: decision, previous: before, current: result }), result: json(result) } }); return result;
    }, { timeout: 60000 });
  }
}
async function updateOccurrence(tx: Tx, userId: string, id: string, currentVersion: number, data: Parameters<Tx['expenseOccurrence']['updateMany']>[0]['data']) {
  if (currentVersion >= 2147483647) fail(409, 'RECURRENCE_VERSION_CONFLICT', 'Versão da ocorrência esgotada.');
  const updated = await tx.expenseOccurrence.updateMany({ where: { id, userId, version: currentVersion }, data: { ...data, version: { increment: 1 } } });
  if (updated.count !== 1) fail(409, 'RECURRENCE_VERSION_CONFLICT', 'Ocorrência mudou. Atualize a prévia.');
}
async function expenseJournal(tx: Tx, userId: string, current: ExpenseDTO, previous: ExpenseDTO | null, decisionId: string, ruleId: string, occurrenceId: string) {
  await tx.expenseCommand.create({ data: { userId, expenseId: current.id, key: randomUUID(), requestHash: digest({ decisionId, occurrenceId }), version: current.version,
    changes: json({ action: 'confirm_recurrence', recurrenceDecisionId: decisionId, ruleId, occurrenceId, previous, current }), result: json(current) } });
}
