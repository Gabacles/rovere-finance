import { describe, expect, it } from 'vitest';
import { normalizeIncomeRecurrence } from '../src/income-recurrences.js';
import { normalizeRecurrenceChange, occurrenceChangeDisposition, recurrenceTransition, scheduledIncomeCandidate, scheduleInPeriod } from '../src/income-recurrence-lifecycle.js';
import { parseCivilDate } from '../src/civil-date.js';
const input = normalizeIncomeRecurrence({ description: 'Receita fictícia', amount: { currency: 'BRL', cents: '9223372036854775807' }, anchorDay: 31, startsOn: '2024-01-01', endsOn: null });
const initial = { ...input, version: 0, effectiveFrom: '0001-01', evidence: { kind: 'user' as const, decisionId: 'initial' } };
describe('RF-030 explicit recurrence lifecycle', () => {
  it('has explicit pause/resume, terminal cancellation and no automatic generation', () => {
    expect(recurrenceTransition('active', 'pause')).toBe('paused'); expect(recurrenceTransition('paused', 'resume')).toBe('active');
    expect(recurrenceTransition('paused', 'edit')).toBe('paused'); expect(recurrenceTransition('active', 'edit')).toBe('active');
    for (const state of ['active', 'paused'] as const) expect(recurrenceTransition(state, 'cancel')).toBe('cancelled');
    for (const action of ['edit', 'pause', 'resume', 'cancel'] as const) expect(() => recurrenceTransition('cancelled', action)).toThrow();
    expect(() => recurrenceTransition('paused', 'pause')).toThrow(); expect(() => recurrenceTransition('active', 'resume')).toThrow();
  });
  it('selects temporal revisions with version tie-break without rewriting initial schedule or anchor', () => {
    const february = { ...initial, version: 2, effectiveFrom: '2024-02', anchorDay: 30 }; const march = { ...initial, version: 1, effectiveFrom: '2024-03', anchorDay: 15 };
    const schedules = [initial, march, february]; expect(scheduledIncomeCandidate(schedules, '2024-01').expectedOn).toBe('2024-01-31'); expect(scheduledIncomeCandidate(schedules, '2024-02').expectedOn).toBe('2024-02-29'); expect(scheduledIncomeCandidate(schedules, '2024-03').expectedOn).toBe('2024-03-15'); expect(initial.anchorDay).toBe(31);
    expect(scheduleInPeriod([...schedules, { ...february, version: 3, anchorDay: 28 }], '2024-02').anchorDay).toBe(28);
    expect(() => scheduleInPeriod([], '2026-01')).toThrow();
  });
  it.each([{ state: 'cancelled', reason: 'cancelled' }, { exception: true, reason: 'individual' }, { received: true, reason: 'received' }, { expectedOn: '2026-10-14', reason: 'past' }, { expectedOn: '2026-10-15', reason: 'past' }, { expectedOn: null, reason: 'past' }, { period: '2026-09', reason: 'past' }, { reason: 'update' }])('preserves protected occurrence %j', patch => {
    const value = { period: '2026-11', expectedOn: parseCivilDate('2026-11-30'), state: 'planned' as const, exception: false, received: false, ...patch };
    expect(occurrenceChangeDisposition(value as Parameters<typeof occurrenceChangeDisposition>[0], '2026-10', parseCivilDate('2026-10-15'))).toBe(patch.reason);
  });
  it('normalizes fixed exact money and rejects startsOn changes and extra financial assumptions', () => {
    const { startsOn: _start, ...patch } = input;
    expect(normalizeRecurrenceChange({ action: 'edit', fromPeriod: '2026-11', input: patch })).toEqual({ action: 'edit', fromPeriod: '2026-11', input: patch });
    for (const body of [{ action: 'edit', fromPeriod: '2026-11', input }, { action: 'pause', incomeId: 'other' }, { action: 'resume', automaticFill: true }, { action: 'delete' }, { action: 'edit', fromPeriod: '0000-01', input: patch }, { action: 'edit', fromPeriod: '2026-11', input: { ...patch, amount: { currency: 'BRL', cents: 'abc' } } }]) expect(() => normalizeRecurrenceChange(body)).toThrow();
  });
});
