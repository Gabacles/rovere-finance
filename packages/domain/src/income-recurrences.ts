import { occurrenceInMonth, parseCivilDate } from './civil-date.js';
import type { CivilDate } from './civil-date.js';
import { normalizeIncomePatch } from './incomes.js';
import type { MoneyDTO } from './money.js';
import type { Evidence } from './import-contracts.js';

export const MAX_GENERATION_MONTHS = 120;
export interface IncomeRecurrenceInput { description: string; notes: string | null; amount: MoneyDTO; anchorDay: number; startsOn: CivilDate; endsOn: CivilDate | null }
export type RecurrenceState = 'active' | 'paused' | 'cancelled';
export interface RecurrenceSchedule extends IncomeRecurrenceInput { effectiveFrom: string; version: number; evidence: Evidence }
export interface IncomeRecurrenceDTO extends IncomeRecurrenceInput { id: string; version: number; cadence: 'monthly'; evidence: Evidence; occurrenceCount: number; state: RecurrenceState; schedules: RecurrenceSchedule[] }
export interface GenerationRange { fromPeriod: string; toPeriod: string }
export class RecurrenceError extends TypeError { constructor(public readonly field: string) { super('Invalid income recurrence.'); } }
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw new RecurrenceError('recurrence');
  return value as Record<string, unknown>;
}
export function normalizeIncomeRecurrence(value: unknown): IncomeRecurrenceInput {
  const data = object(value, ['description', 'notes', 'amount', 'anchorDay', 'startsOn', 'endsOn']);
  try {
    if (data.amount === null || data.amount === undefined) throw new RecurrenceError('amount');
    const income = normalizeIncomePatch({ description: data.description, ...(data.notes === undefined ? {} : { notes: data.notes }), facts: { expectedAmount: data.amount } }, true);
    if (!Number.isInteger(data.anchorDay) || (data.anchorDay as number) < 1 || (data.anchorDay as number) > 31) throw new RecurrenceError('anchorDay');
    const startsOn = parseCivilDate(data.startsOn as string); const endsOn = data.endsOn === null ? null : parseCivilDate(data.endsOn as string);
    if (endsOn !== null && endsOn < startsOn) throw new RecurrenceError('endsOn');
    return { description: income.description!, notes: income.notes ?? null, amount: income.facts!.expectedAmount!, anchorDay: data.anchorDay as number, startsOn, endsOn };
  } catch (error) { throw error instanceof RecurrenceError ? error : new RecurrenceError('recurrence'); }
}
function monthIndex(period: unknown): number {
  if (typeof period !== 'string' || !/^\d{4}-\d{2}$/.test(period)) throw new RecurrenceError('period');
  try { parseCivilDate(`${period}-01`); } catch { throw new RecurrenceError('period'); }
  return (Number(period.slice(0, 4)) - 1) * 12 + Number(period.slice(5, 7)) - 1;
}
export function normalizeGenerationRange(value: unknown): GenerationRange {
  const data = object(value, ['fromPeriod', 'toPeriod']); const from = monthIndex(data.fromPeriod); const to = monthIndex(data.toPeriod);
  if (to < from || to - from + 1 > MAX_GENERATION_MONTHS) throw new RecurrenceError('range');
  return { fromPeriod: data.fromPeriod as string, toPeriod: data.toPeriod as string };
}
/** Uses the original anchor for every month; never bases March on February's adjusted day. */
export function monthlyIncomeCandidates(rule: IncomeRecurrenceInput, range: GenerationRange) {
  const valid = normalizeGenerationRange(range); const from = monthIndex(valid.fromPeriod); const to = monthIndex(valid.toPeriod);
  return Array.from({ length: to - from + 1 }, (_, index) => {
    const ordinal = from + index; const year = Math.floor(ordinal / 12) + 1; const month = ordinal % 12 + 1;
    const expectedOn = occurrenceInMonth(rule.anchorDay, year, month);
    return { period: expectedOn.slice(0, 7), expectedOn, amount: rule.amount, eligible: expectedOn >= rule.startsOn && (rule.endsOn === null || expectedOn <= rule.endsOn) };
  });
}
