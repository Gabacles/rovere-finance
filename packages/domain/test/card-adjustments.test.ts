import { describe, expect, it } from 'vitest';
import { assertAdjustmentReversal, normalizeManualAdjustment, refundCost } from '../src/card-adjustments.js';
import { paymentProgress } from '../src/statement-payments.js';
const money = (cents: string) => ({ currency: 'BRL' as const, cents });
const manual = (overrides = {}) => ({ postedOn: '2026-10-08', description: 'Estorno informado', amount: money('2000'), classification: { nature: 'refund', amount: money('2000') }, reason: 'Informado pela instituição', informedConfirmed: true, ...overrides });
describe('traceable card adjustments and refund review', () => {
  it('validates explicit manual source and compensating reversal without inferring raw sign', () => {
    const value = normalizeManualAdjustment(manual()); expect(value.amount.cents).toBe('2000'); assertAdjustmentReversal(value.classification, { nature: 'other_debit', amount: money('2000') });
    expect(() => assertAdjustmentReversal(value.classification, { nature: 'other_credit', amount: money('2000') })).toThrow(); expect(() => assertAdjustmentReversal(value.classification, { nature: 'other_debit', amount: money('1999') })).toThrow();
    for (const overrides of [{ informedConfirmed: false }, { postedOn: '2026-02-30' }, { reason: '' }, { classification: { nature: 'purchase', amount: money('2000') } }, { amount: money('0') }, { amount: money('2.5') }]) expect(() => normalizeManualAdjustment(manual(overrides))).toThrow();
  });
  it('derives eligible cost without changing original total or inventing partial purchase data', () => {
    expect(refundCost(money('10000'), [money('2000')])).toMatchObject({ refunded: { cents: '2000' }, eligibleCost: { state: 'available', amount: { cents: '8000' } }, reviewRequired: true });
    expect(refundCost(null, [money('2000')])).toMatchObject({ eligibleCost: { state: 'unknown' }, reviewRequired: true }); expect(refundCost(money('1000'), [money('2000')]).eligibleCost.state).toBe('unknown');
  });
  it('preserves actual payments on explicitly reviewed excess and never frees their cash reservation', () => {
    const amounts = [money('5000')]; expect(paymentProgress(money('3000'), true, amounts).state).toBe('review_required');
    const reviewed = paymentProgress(money('3000'), true, amounts, true); expect(reviewed).toMatchObject({ state: 'credit_review_required', allocated: { cents: '5000' }, remaining: { amount: { cents: '0' } }, creditExcess: { amount: { cents: '2000' } } });
    expect(paymentProgress(money('0'), true, amounts, true).state).toBe('credit_review_required'); expect(paymentProgress(money('3000'), false, amounts, true).state).toBe('review_required');
  });
});
