import { describe, expect, it } from 'vitest';
import { assertIncomeReceiptChange, assertIncomeSettlement, incomeReceiptProgress } from '../src/income-settlements.js';
const money = (cents: string) => ({ currency: 'BRL' as const, cents });
describe('P3-03 explicit income settlements', () => {
  it('separates unknown and confirmed zero from real receipts', () => {
    expect(incomeReceiptProgress('planned', null, []).state).toBe('unknown');
    expect(incomeReceiptProgress('planned', money('0'), []).state).toBe('no_expected_amount');
    expect(incomeReceiptProgress('planned', money('10001'), []).state).toBe('unreceived');
    expect(incomeReceiptProgress('cancelled', money('10001'), []).state).toBe('cancelled');
    expect(() => assertIncomeSettlement('planned', null, [], money('10001'), [], money('1'))).toThrow('Invalid income settlement');
    expect(() => assertIncomeSettlement('planned', money('0'), [], money('10001'), [], money('1'))).toThrow();
    expect(() => assertIncomeSettlement('cancelled', money('10001'), [], money('10001'), [], money('1'))).toThrow();
  });
  it('keeps exact partial differences and requires the full expected amount for received state', () => {
    const partial = incomeReceiptProgress('planned', money('10001'), [money('3334')]);
    expect(partial).toEqual({ state: 'partial', received: money('3334'), pending: { state: 'available', amount: money('6667') }, difference: { state: 'available', amount: money('-6667') } });
    expect(incomeReceiptProgress('planned', money('10001'), [money('3334'), money('6667')]).state).toBe('received');
    expect(incomeReceiptProgress('planned', money('10001'), [money('10002')]).state).toBe('review_required');
    expect(incomeReceiptProgress('planned', money('10001'), [money('3334')], false).pending).toEqual({ state: 'unknown' });
  });
  it('shares source reservations and refuses any excess instead of rounding or writing off', () => {
    expect(() => assertIncomeSettlement('planned', money('10001'), [money('3334')], money('20000'), [money('13000')], money('6667'))).not.toThrow();
    expect(() => assertIncomeSettlement('planned', money('10001'), [money('3334')], money('20000'), [], money('6668'))).toThrow();
    expect(() => assertIncomeSettlement('planned', money('10001'), [], money('20000'), [money('13000')], money('7001'))).toThrow();
  });
  it('protects received evidence on editing and cancellation, preserving omitted facts', () => {
    expect(() => assertIncomeReceiptChange('edit', money('6000'), undefined)).not.toThrow();
    expect(() => assertIncomeReceiptChange('edit', money('6000'), money('6000'))).not.toThrow();
    expect(() => assertIncomeReceiptChange('edit', money('6000'), money('5999'))).toThrow();
    expect(() => assertIncomeReceiptChange('edit', money('6000'), null)).toThrow();
    expect(() => assertIncomeReceiptChange('cancel', money('6000'), undefined)).toThrow();
    expect(() => assertIncomeReceiptChange('cancel', money('0'), undefined)).not.toThrow();
  });
  it.each(['0', '-1', '1.2', '1e3', '+1', '9223372036854775808'])('rejects invalid settlement cents %s', cents => {
    expect(() => assertIncomeSettlement('planned', money('10000'), [], money('10000'), [], money(cents))).toThrow();
  });
  it('rejects overflowing aggregation and preserves BIGINT maximum exactly', () => {
    expect(incomeReceiptProgress('planned', money('9223372036854775807'), [money('9223372036854775807')]).state).toBe('received');
    expect(() => incomeReceiptProgress('planned', money('9223372036854775807'), [money('9223372036854775807'), money('1')])).toThrow();
  });
});
