import { describe, expect, it } from 'vitest';
import { installmentDifference, installmentForecasts, InstallmentError, installmentMoney, normalizeInstallmentPlan, validateInstallmentMatch } from '../src/installment-plans.js';
import { addCents, parseCents } from '../src/money.js';

const input = (overrides = {}) => ({ total: { currency: 'BRL', cents: '10000' }, count: 3, creditAccountId: 'credit', firstPeriod: '2026-12', cadence: 'monthly', ...overrides });
describe('confirmed monthly installment forecasts', () => {
  it('reuses exact allocation, assigns remainder first and rolls months without civil dates', () => {
    const plan = normalizeInstallmentPlan(input()); const rows = installmentForecasts(plan);
    expect(rows.map(row => row.plannedAmount.cents)).toEqual(['3334', '3333', '3333']); expect(rows.map(row => row.period)).toEqual(['2026-12', '2027-01', '2027-02']);
    expect(rows.reduce((sum, row) => addCents(sum, parseCents(row.plannedAmount.cents)), parseCents('0'))).toBe(10000n);
    expect(rows[0]).not.toHaveProperty('postedOn'); expect(rows[0]).not.toHaveProperty('chargeId');
  });
  it('allocates zero and BIGINT maximum exactly and rejects invalid explicit facts/calendar overflow', () => {
    expect(installmentForecasts(normalizeInstallmentPlan(input({ total: { currency: 'BRL', cents: '0' } }))).every(row => row.plannedAmount.cents === '0')).toBe(true);
    const rows = installmentForecasts(normalizeInstallmentPlan(input({ total: { currency: 'BRL', cents: '9223372036854775807' } })));
    expect(rows.reduce((sum, row) => addCents(sum, parseCents(row.plannedAmount.cents)), parseCents('0'))).toBe(9223372036854775807n);
    for (const overrides of [{ count: 0 }, { count: 10001 }, { count: 1.5 }, { cadence: 'guess' }, { firstPeriod: '9999-12' }, { firstPeriod: '0000-01' }, { firstPeriod: '2026-13' }, { total: { currency: 'BRL', cents: '-1' } }, { total: { currency: 'BRL', cents: '1.2' } }, { total: { currency: 'USD', cents: '1' } }, { guessed: true }]) expect(() => normalizeInstallmentPlan(input(overrides))).toThrow(InstallmentError);
  });
  it('preserves partial import knowledge and accepts only explicit matching credit/period/known installment facts', () => {
    const plan = normalizeInstallmentPlan(input()); const forecast = installmentForecasts(plan)[0]!;
    const original = { creditAccountId: 'credit', period: '2026-12', cents: '-3335', installment: { state: 'unknown' } as const };
    const before = structuredClone(original); const confirmed = installmentMoney({ currency: 'BRL', cents: '3335' });
    validateInstallmentMatch(plan, forecast, original, confirmed); expect(original).toEqual(before); expect(installmentDifference(confirmed, forecast.plannedAmount).cents).toBe('1');
    for (const overrides of [{ creditAccountId: 'other' }, { period: '2027-01' }, { cents: '-3336' }, { installment: { state: 'confirmed', value: { number: 2, total: { state: 'unknown' } }, evidence: { kind: 'user', decisionId: 'fictitious' } } }, { installment: { state: 'confirmed', value: { number: 1, total: { state: 'confirmed', value: 4, evidence: { kind: 'user', decisionId: 'fictitious' } } }, evidence: { kind: 'user', decisionId: 'fictitious' } } }] ) expect(() => validateInstallmentMatch(plan, forecast, { ...original, ...overrides } as Parameters<typeof validateInstallmentMatch>[2], confirmed)).toThrow(InstallmentError);
  });
  it('uses actual magnitude only after confirmation while keeping original sign and signed difference', () => {
    const plan = normalizeInstallmentPlan(input()); const forecast = installmentForecasts(plan)[0]!; const confirmed = installmentMoney({ currency: 'BRL', cents: '3300' });
    validateInstallmentMatch(plan, forecast, { creditAccountId: 'credit', period: '2026-12', cents: '3300', installment: { state: 'unknown' } }, confirmed);
    expect(installmentDifference(confirmed, forecast.plannedAmount).cents).toBe('-34');
    expect(() => validateInstallmentMatch(plan, forecast, { creditAccountId: 'credit', period: '2026-12', cents: '-9223372036854775808', installment: { state: 'unknown' } }, installmentMoney({ currency: 'BRL', cents: '9223372036854775807' }))).toThrow(InstallmentError);
  });
});
