import { normalizeIncomeRecurrence, normalizeGenerationRange } from './income-recurrences.js';
import type { IncomeRecurrenceInput, IncomeRecurrenceDTO } from './income-recurrences.js';
import { normalizeRecurrenceChange } from './income-recurrence-lifecycle.js';
import { normalizeExpensePatch } from './expenses.js';
import type { ExpenseDTO, ExpensePatch } from './expenses.js';
import { parseCivilDate } from './civil-date.js';
import { parseCents, subtractCents, toMoneyDTO } from './money.js';
import type { MoneyDTO } from './money.js';
import type { Evidence } from './import-contracts.js';

// The same fixed monthly calendar and lifecycle rules apply to both kinds of forecast.
export type ExpenseRecurrenceInput = IncomeRecurrenceInput;
export type ExpenseRecurrenceDTO = IncomeRecurrenceDTO;
export const normalizeExpenseRecurrence = normalizeIncomeRecurrence;
export interface ExpenseOccurrenceInput { description: string; notes: string | null; expectedOn: string; amount: MoneyDTO }
export interface ExpenseOccurrenceDTO extends ExpenseOccurrenceInput {
  id: string; period: string; version: number; state: 'planned' | 'recorded' | 'cancelled'; individual: boolean;
  original: { expectedOn: string; amount: MoneyDTO; ruleVersion: number; evidence: Evidence };
  expense: ExpenseDTO | null; confirmation: ExpenseDTO | null; reviewRequired: boolean; difference: MoneyDTO | null;
  settlement: 'not_supported';
}
export type ExpenseRecurrenceOperation =
  | { action: 'generate'; fromPeriod: string; toPeriod: string }
  | { action: 'edit_series'; fromPeriod: string; input: Omit<ExpenseRecurrenceInput, 'startsOn'> }
  | { action: 'pause' | 'resume' | 'cancel_series' }
  | { action: 'edit_occurrence'; occurrenceId: string; input: ExpenseOccurrenceInput }
  | { action: 'cancel_occurrence'; occurrenceId: string }
  | { action: 'record'; occurrenceId: string; expense: ExpensePatch }
  | { action: 'link'; occurrenceId: string; expenseId: string; expectedExpenseVersion: number }
  | { action: 'review'; occurrenceId: string; expectedExpenseVersion: number };
export function normalizeExpenseOccurrence(value: unknown): ExpenseOccurrenceInput {
  const data = strict(value, ['description', 'notes', 'expectedOn', 'amount']);
  const rule = normalizeExpenseRecurrence({ description: data.description, notes: data.notes, amount: data.amount, startsOn: data.expectedOn, endsOn: null, anchorDay: 1 });
  return { description: rule.description, notes: rule.notes, expectedOn: parseCivilDate(data.expectedOn as string), amount: rule.amount };
}
function strict(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw new TypeError('Invalid expense recurrence.');
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new TypeError('Invalid identifier.'); return value;
}
function version(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) >= 2147483647) throw new TypeError('Invalid version.'); return value as number;
}
export function normalizeExpenseRecurrenceOperation(value: unknown): ExpenseRecurrenceOperation {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid operation.');
  const action = (value as Record<string, unknown>).action;
  if (action === 'generate') { const data = strict(value, ['action', 'fromPeriod', 'toPeriod']); return { action, ...normalizeGenerationRange({ fromPeriod: data.fromPeriod, toPeriod: data.toPeriod }) }; }
  if (action === 'edit_series') {
    const data = strict(value, ['action', 'fromPeriod', 'input']); const change = normalizeRecurrenceChange({ action: 'edit', fromPeriod: data.fromPeriod, input: data.input });
    if (change.action !== 'edit') throw new TypeError(); return { ...change, action };
  }
  if (action === 'pause' || action === 'resume' || action === 'cancel_series') { strict(value, ['action']); return { action }; }
  if (action === 'edit_occurrence') { const data = strict(value, ['action', 'occurrenceId', 'input']); return { action, occurrenceId: identifier(data.occurrenceId), input: normalizeExpenseOccurrence(data.input) }; }
  if (action === 'cancel_occurrence') { const data = strict(value, ['action', 'occurrenceId']); return { action, occurrenceId: identifier(data.occurrenceId) }; }
  if (action === 'record') {
    const data = strict(value, ['action', 'occurrenceId', 'expense']); const expense = normalizeExpensePatch(data.expense, true);
    if (!expense.facts?.purchasedOn || !expense.facts.total) throw new TypeError('Confirmed date and amount required.');
    return { action, occurrenceId: identifier(data.occurrenceId), expense };
  }
  if (action === 'link' || action === 'review') {
    const data = strict(value, ['action', 'occurrenceId', 'expectedExpenseVersion', ...(action === 'link' ? ['expenseId'] : [])]);
    return { action, occurrenceId: identifier(data.occurrenceId), expectedExpenseVersion: version(data.expectedExpenseVersion), ...(action === 'link' ? { expenseId: identifier(data.expenseId) } : {}) } as ExpenseRecurrenceOperation;
  }
  throw new TypeError('Invalid operation.');
}
/** Compare confirmed economic facts, never the forecast or imported charge as a new expense. */
export function expenseOccurrenceFacts(expected: MoneyDTO, expense: ExpenseDTO | null, confirmation: ExpenseDTO | null) {
  if (!expense) return { reviewRequired: false, difference: null };
  const date = expense.facts.purchasedOn; const total = expense.facts.total;
  const originalDate = confirmation?.facts.purchasedOn; const originalTotal = confirmation?.facts.total;
  const reviewRequired = date.state !== 'confirmed' || total.state !== 'confirmed' || originalDate?.state !== 'confirmed' || originalTotal?.state !== 'confirmed'
    || date.value !== originalDate.value || total.value.cents !== originalTotal.value.cents;
  return { reviewRequired, difference: total.state === 'confirmed' ? expenseAmountDifference(expected, total.value) : null };
}
export function expenseAmountDifference(expected: MoneyDTO, actual: MoneyDTO): MoneyDTO { return toMoneyDTO(subtractCents(parseCents(actual.cents), parseCents(expected.cents))); }
export function assertExpenseOccurrenceAction(state: ExpenseOccurrenceDTO['state'], action: ExpenseRecurrenceOperation['action']) {
  if (state === 'cancelled' || (state === 'recorded' ? action !== 'review' : action === 'review')) throw new TypeError('Review occurrence dependencies before changing it.');
}
