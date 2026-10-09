import { describe, expect, it } from 'vitest';
import { allocatedTotal, assertPaymentLimits, confirmOutflow, paymentMoney, paymentProgress } from '../src/statement-payments.js';
const money = (cents: string) => ({ currency: 'BRL' as const, cents });
describe('explicit statement payment allocations', () => {
  it('keeps unknown/zero obligations separate from payment and derives partial/paid from allocations only', () => {
    expect(paymentProgress(null, false, []).state).toBe('unknown'); expect(paymentProgress(money('0'), true, []).state).toBe('no_obligation'); expect(paymentProgress(money('10001'), true, []).state).toBe('unpaid');
    expect(paymentProgress(money('10001'), true, [money('3334')])).toMatchObject({ state: 'partial', remaining: { amount: { cents: '6667' } } });
    expect(paymentProgress(money('10001'), true, [money('3334'), money('6667')])).toMatchObject({ state: 'paid', remaining: { amount: { cents: '0' } } });
    expect(paymentProgress(money('10001'), false, [money('3334')])).toMatchObject({ state: 'review_required', allocated: { cents: '3334' }, remaining: { state: 'unknown' } });
  });
  it('checks both movement availability and target remainder, including one movement split among invoices', () => {
    assertPaymentLimits(money('30000'), [money('10000')], money('20000'), [], money('20000'));
    expect(() => assertPaymentLimits(money('30000'), [money('10000')], money('25000'), [], money('20001'))).toThrow('Invalid statement payment decision');
    expect(() => assertPaymentLimits(money('30000'), [], money('20000'), [money('19999')], money('2'))).toThrow();
    expect(allocatedTotal([money('3334'), money('3333'), money('3333')]).cents).toBe('10000');
  });
  it('requires confirmed outflow magnitude without deriving direction from sign', () => {
    confirmOutflow('-10000', money('10000')); confirmOutflow('10000', money('10000'));
    expect(() => confirmOutflow('-10000', money('9999'))).toThrow(); expect(() => confirmOutflow('-9223372036854775808', money('9223372036854775807'))).toThrow();
  });
  it('rejects zero allocations, floats, foreign currency and overflow while accepting explicit zero bases', () => {
    for (const value of [money('0'), money('-1'), money('1.2'), money('9223372036854775808'), { currency: 'USD', cents: '1' }, { currency: 'BRL', cents: 1 }]) expect(() => paymentMoney(value)).toThrow();
    expect(paymentMoney(money('0'), false)).toEqual(money('0')); expect(() => allocatedTotal([money('9223372036854775807'), money('1')])).toThrow();
  });
});
