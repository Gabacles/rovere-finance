import { createHash } from 'node:crypto';
import { assertExpenseOccurrenceAction, expenseAmountDifference, expenseOccurrenceFacts, monthlyIncomeCandidates, normalizeExpenseRecurrence, occurrenceChangeDisposition, recurrenceTransition, scheduledIncomeCandidate, scheduleInPeriod, toMoneyDTO, parseCents, parseCivilDate } from '@rovere/domain';
import type { Evidence, ExpenseDTO, ExpenseOccurrenceDTO, ExpenseRecurrenceDTO, ExpenseRecurrenceOperation, RecurrenceSchedule, RecurrenceState } from '@rovere/domain';
import type { Prisma, ExpenseOccurrence } from '../generated/prisma/client.js';
import type { Database } from '../database.js';
import { fail } from '../imports/validation.js';
import { expenseDetails } from './expenses.service.js';

export type Tx = Prisma.TransactionClient;
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const civil = (value: Date) => value.toISOString().slice(0, 10);
export const today = () => parseCivilDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
export const include = { _count: { select: { occurrences: true } }, schedules: { orderBy: { version: 'asc' as const } } };
type RuleRow = Prisma.ExpenseRecurrenceGetPayload<{ include: typeof include }>;
export function ruleDTO(row: RuleRow): ExpenseRecurrenceDTO {
  const fields = (value: RuleRow | RuleRow['schedules'][number]) => ({ description: value.description, notes: value.notes, amount: toMoneyDTO(parseCents(value.cents.toString())), anchorDay: value.anchorDay, startsOn: civil(value.startsOn) as ExpenseRecurrenceDTO['startsOn'], endsOn: value.endsOn ? civil(value.endsOn) as ExpenseRecurrenceDTO['startsOn'] : null });
  return { id: row.id, ...fields(row), version: row.version, cadence: 'monthly', state: row.state as RecurrenceState, evidence: row.evidence as unknown as Evidence, occurrenceCount: row._count.occurrences,
    schedules: row.schedules.map(value => ({ ...fields(value), version: value.version, effectiveFrom: value.effectiveFrom, evidence: value.evidence as unknown as Evidence })) };
}
export async function ruleDetails(tx: Tx | Database, userId: string, id: string) {
  const row = await tx.expenseRecurrence.findUnique({ where: { id_userId: { id, userId } }, include });
  if (!row) fail(404, 'EXPENSE_RECURRENCE_NOT_FOUND', 'Regra de despesa não encontrada.'); return ruleDTO(row);
}
export async function occurrenceDTO(tx: Tx | Database, userId: string, row: ExpenseOccurrence): Promise<ExpenseOccurrenceDTO> {
  const expense = row.expenseId ? await expenseDetails(tx, userId, row.expenseId) : null;
  const confirmation = row.confirmation as unknown as ExpenseDTO | null; const amount = toMoneyDTO(parseCents(row.cents.toString()));
  return { id: row.id, period: row.period, version: row.version, state: row.state as ExpenseOccurrenceDTO['state'], individual: row.individual,
    description: row.description, notes: row.notes, expectedOn: civil(row.expectedOn), amount,
    original: { expectedOn: civil(row.originalExpectedOn), amount: toMoneyDTO(parseCents(row.originalCents.toString())), ruleVersion: row.ruleVersion, evidence: row.evidence as unknown as Evidence },
    expense, confirmation, ...expenseOccurrenceFacts(amount, expense, confirmation), settlement: 'not_supported' };
}
export async function occurrenceDetails(tx: Tx | Database, userId: string, ruleId: string, id: string) {
  const row = await tx.expenseOccurrence.findFirst({ where: { id, userId, ruleId } });
  if (!row) fail(404, 'EXPENSE_OCCURRENCE_NOT_FOUND', 'Ocorrência não encontrada nesta regra.'); return occurrenceDTO(tx, userId, row);
}
export interface PreviewRow { period: string; expectedOn: string; amount: { currency: 'BRL'; cents: string }; disposition: string; occurrence: ExpenseOccurrenceDTO | null }
export async function expensePreview(tx: Tx, userId: string, id: string, operation: ExpenseRecurrenceOperation) {
  const rule = await ruleDetails(tx, userId, id); const asOf = today(); const rows: PreviewRow[] = [];
  let occurrence: ExpenseOccurrenceDTO | null = null; let expense: ExpenseDTO | null = null;
  if (operation.action === 'generate') {
    const found = await tx.expenseOccurrence.findMany({ where: { userId, ruleId: id, period: { gte: operation.fromPeriod, lte: operation.toPeriod } } });
    for (const candidate of monthlyIncomeCandidates(rule, { fromPeriod: operation.fromPeriod, toPeriod: operation.toPeriod })) {
      const next = scheduledIncomeCandidate(rule.schedules, candidate.period); const existing = found.find(row => row.period === next.period);
      rows.push({ period: next.period, expectedOn: next.expectedOn, amount: next.amount,
        disposition: existing ? 'existing' : !next.eligible ? 'outside_rule' : rule.state !== 'active' ? 'blocked' : 'create', occurrence: existing ? await occurrenceDTO(tx, userId, existing) : null });
    }
  } else if (operation.action === 'edit_series' || operation.action === 'pause' || operation.action === 'resume' || operation.action === 'cancel_series') {
    try { recurrenceTransition(rule.state, operation.action === 'edit_series' ? 'edit' : operation.action === 'cancel_series' ? 'cancel' : operation.action); }
    catch { fail(409, 'RECURRENCE_STATE_CONFLICT', 'Esta ação não é permitida no estado atual da regra.'); }
    if (operation.action === 'edit_series') {
      if (operation.fromPeriod < asOf.slice(0, 7)) fail(400, 'RECURRENCE_FUTURE_REQUIRED', 'Escolha o mês atual ou um mês futuro.');
      let input; try { input = normalizeExpenseRecurrence({ ...operation.input, startsOn: rule.startsOn }); } catch { fail(400, 'INVALID_EXPENSE_RECURRENCE', 'Confira a vigência e os dados da programação.'); }
      const revision: RecurrenceSchedule = { ...input, effectiveFrom: operation.fromPeriod, version: rule.version + 1, evidence: { kind: 'user', decisionId: 'preview' } };
      const schedules = [...rule.schedules, revision];
      for (const row of await tx.expenseOccurrence.findMany({ where: { ruleId: id, userId }, orderBy: { period: 'asc' } })) {
        const current = await occurrenceDTO(tx, userId, row); const next = scheduledIncomeCandidate(schedules, row.period);
        let disposition: string = occurrenceChangeDisposition({ period: row.period, expectedOn: civil(row.expectedOn) as RecurrenceSchedule['startsOn'], state: row.state === 'cancelled' ? 'cancelled' : 'planned', exception: row.individual, received: Boolean(row.expenseId) }, operation.fromPeriod, asOf);
        if (disposition === 'received') disposition = 'recorded';
        if (disposition === 'update' && scheduleInPeriod(schedules, row.period).version !== revision.version) disposition = 'later_schedule';
        if (disposition === 'update' && !next.eligible) disposition = 'outside_rule';
        if (disposition === 'update' && next.expectedOn <= asOf) disposition = 'past';
        rows.push({ period: row.period, expectedOn: next.expectedOn, amount: next.amount, disposition, occurrence: current });
      }
    }
  } else if ('occurrenceId' in operation) {
    occurrence = await occurrenceDetails(tx, userId, id, operation.occurrenceId);
    try { assertExpenseOccurrenceAction(occurrence.state, operation.action); } catch { fail(409, 'EXPENSE_OCCURRENCE_DEPENDENCY', 'Ocorrência cancelada é definitiva; despesa registrada permanece vinculada e só admite revisão explícita.'); }
    if (operation.action === 'link' || operation.action === 'review') {
      const expenseId = operation.action === 'link' ? operation.expenseId : occurrence.expense!.id;
      expense = await expenseDetails(tx, userId, expenseId);
      if (expense.version !== operation.expectedExpenseVersion) fail(409, 'EXPENSE_VERSION_CONFLICT', 'A despesa mudou. Atualize e revise os fatos.');
      if (expense.knowledge !== 'complete') fail(409, 'EXPENSE_FACTS_REQUIRED', 'Confirme a data original e o total na despesa antes de vinculá-la ou revisar.');
      if (operation.action === 'link' && await tx.expenseOccurrence.findUnique({ where: { expenseId } })) fail(409, 'EXPENSE_ALREADY_RECORDED', 'Esta despesa já confirma outra ocorrência.');
    }
  }
  const counts = { create: rows.filter(row => row.disposition === 'create').length, update: rows.filter(row => row.disposition === 'update').length,
    preserve: rows.filter(row => !['create', 'update'].includes(row.disposition)).length + (['pause', 'resume', 'cancel_series'].includes(operation.action) ? rule.occurrenceCount : 0) };
  const actualAmount = operation.action === 'record' ? operation.expense.facts!.total! : expense?.facts.total.state === 'confirmed' ? expense.facts.total.value : null;
  const difference = occurrence && actualAmount ? expenseAmountDifference(occurrence.amount, actualAmount) : null;
  const result = { rule, operation, asOf, rows, occurrence, expense, counts, difference }; return { ...result, previewHash: digest(result) };
}
