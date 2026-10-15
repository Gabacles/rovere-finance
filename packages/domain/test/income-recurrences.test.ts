import { describe, expect, it } from 'vitest';
import { MAX_GENERATION_MONTHS, monthlyIncomeCandidates, normalizeGenerationRange, normalizeIncomeRecurrence } from '../src/income-recurrences.js';
const input = { description: ' Salário fictício ', amount: { currency: 'BRL', cents: '9223372036854775807' }, anchorDay: 31, startsOn: '0001-01-01', endsOn: null };
const candidates = (anchorDay: number, fromPeriod: string, toPeriod: string) => monthlyIncomeCandidates(normalizeIncomeRecurrence({ ...input, anchorDay }), { fromPeriod, toPeriod });
describe('RF-029 finite monthly income generation', () => {
  it('preserves exact maximum BIGINT, explicit zero and a normalized rule without framework dependencies', () => {
    const rule = normalizeIncomeRecurrence(input); expect(rule.amount.cents).toBe('9223372036854775807'); expect(rule.description).toBe('Salário fictício'); expect(rule.notes).toBeNull();
    expect(normalizeIncomeRecurrence({ ...input, amount: { currency: 'BRL', cents: '0' } }).amount.cents).toBe('0');
  });
  it.each([15, 30, 31])('uses original anchor %s in leap and common years and across year boundary', anchor => {
    for (const year of [2024, 2025]) {
      const rows = candidates(anchor, `${year}-01`, `${year}-03`);
      expect(rows.map(row => row.expectedOn)).toEqual([`${year}-01-${anchor}`, `${year}-02-${Math.min(anchor, year === 2024 ? 29 : 28)}`, `${year}-03-${anchor}`]);
    }
    expect(candidates(anchor, '2026-12', '2027-01').map(row => row.period)).toEqual(['2026-12', '2027-01']);
  });
  it('includes exact boundaries and excludes dates beyond rule validity without moving dates', () => {
    const rule = normalizeIncomeRecurrence({ ...input, startsOn: '2024-02-29', endsOn: '2024-03-31' });
    const rows = monthlyIncomeCandidates(rule, { fromPeriod: '2024-01', toPeriod: '2024-04' });
    expect(rows.map(row => row.eligible)).toEqual([false, true, true, false]);
    expect(rows[1]!.expectedOn).toBe('2024-02-29'); expect(rule.anchorDay).toBe(31);
    expect(monthlyIncomeCandidates({ ...rule, startsOn: '2024-03-01' as typeof rule.startsOn }, { fromPeriod: '2024-02', toPeriod: '2024-02' })[0]!.eligible).toBe(false);
  });
  it('supports finite 120-month commands and extreme civil years', () => {
    expect(MAX_GENERATION_MONTHS).toBe(120); expect(candidates(31, '2020-01', '2029-12')).toHaveLength(120);
    expect(candidates(31, '0001-01', '0001-01')[0]!.expectedOn).toBe('0001-01-31');
    expect(candidates(31, '9999-12', '9999-12')[0]!.expectedOn).toBe('9999-12-31');
  });
  it.each([{}, { fromPeriod: '2020-01', toPeriod: '2030-01' }, { fromPeriod: '2026-02', toPeriod: '2026-01' }, ...['0000-01', '10000-01', '2026-13', '2026-1'].map(fromPeriod => ({ fromPeriod, toPeriod: fromPeriod })), { fromPeriod: '2026-01', toPeriod: '2026-02', unbounded: true }])('rejects invalid/unbounded range %j', range => {
    expect(() => normalizeGenerationRange(range)).toThrow();
  });
  it.each([{ amount: null }, { amount: { currency: 'USD', cents: '1' } }, ...['-1', '1.1', '1e2', '+1', '-0', '9223372036854775808', 1].map(cents => ({ amount: { currency: 'BRL', cents } })), { anchorDay: 0 }, { anchorDay: 32 }, { anchorDay: 1.5 }, { startsOn: '2025-02-29' }, { endsOn: undefined }, { endsOn: '0000-01-01' }, { startsOn: '2026-03-01', endsOn: '2026-02-28' }, { description: '' }, { description: 'x'.repeat(501) }, { notes: 'x'.repeat(1001) }, { userId: 'other' }, { cadence: 'weekly' }])('rejects invalid rule %j', patch => {
    expect(() => normalizeIncomeRecurrence({ ...input, ...patch })).toThrow();
  });
});
