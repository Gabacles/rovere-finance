import { normalizeGenerationRange, normalizeIncomeRecurrence, monthlyIncomeCandidates, RecurrenceError } from './income-recurrences.js';
import type { IncomeRecurrenceInput, RecurrenceSchedule, RecurrenceState } from './income-recurrences.js';
import { parseCivilDate } from './civil-date.js';
import type { CivilDate } from './civil-date.js';
export type RecurrenceChange = { action: 'edit'; fromPeriod: string; input: Omit<IncomeRecurrenceInput, 'startsOn'> } | { action: 'pause' | 'resume' | 'cancel' };
export function normalizeRecurrenceChange(value: unknown): RecurrenceChange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RecurrenceError('change');
  const data = value as Record<string, unknown>;
  if (data.action === 'edit') {
    if (Object.keys(data).some(key => !['action', 'fromPeriod', 'input'].includes(key))) throw new RecurrenceError('change');
    const range = normalizeGenerationRange({ fromPeriod: data.fromPeriod, toPeriod: data.fromPeriod });
    if (!data.input || typeof data.input !== 'object' || Array.isArray(data.input) || 'startsOn' in data.input) throw new RecurrenceError('input');
    const input = normalizeIncomeRecurrence({ ...data.input, startsOn: '0001-01-01' }); const { startsOn: _startsOn, ...patch } = input;
    return { action: 'edit', fromPeriod: range.fromPeriod, input: patch };
  }
  if (Object.keys(data).length !== 1 || !['pause', 'resume', 'cancel'].includes(data.action as string)) throw new RecurrenceError('action');
  return { action: data.action as 'pause' | 'resume' | 'cancel' };
}
export function recurrenceTransition(state: RecurrenceState, action: RecurrenceChange['action']): RecurrenceState {
  if (state === 'cancelled' || (action === 'pause' && state !== 'active') || (action === 'resume' && state !== 'paused')) throw new RecurrenceError('state');
  return action === 'cancel' ? 'cancelled' : action === 'pause' ? 'paused' : action === 'resume' ? 'active' : state;
}
export function scheduleInPeriod(schedules: readonly RecurrenceSchedule[], period: string): RecurrenceSchedule {
  normalizeGenerationRange({ fromPeriod: period, toPeriod: period });
  const sorted = [...schedules].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version);
  const chosen = sorted.find(row => row.effectiveFrom <= period) ?? sorted.at(-1);
  if (!chosen) throw new RecurrenceError('schedule'); return chosen;
}
export function scheduledIncomeCandidate(schedules: readonly RecurrenceSchedule[], period: string) {
  const schedule = scheduleInPeriod(schedules, period);
  return monthlyIncomeCandidates(schedule, { fromPeriod: period, toPeriod: period })[0]!;
}
/** Series edits never rewrite past dates, exceptions, cancelled occurrences or real receipts. */
export function occurrenceChangeDisposition(input: { period: string; expectedOn: CivilDate | null; state: 'planned' | 'cancelled'; exception: boolean; received: boolean }, fromPeriod: string, asOf: CivilDate) {
  parseCivilDate(asOf);
  if (input.state === 'cancelled') return 'cancelled';
  if (input.exception) return 'individual';
  if (input.received) return 'received';
  if (input.period < fromPeriod || input.expectedOn === null || input.expectedOn <= asOf) return 'past';
  return 'update';
}
