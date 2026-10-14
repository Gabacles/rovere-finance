import { describe, expect, it } from 'vitest';
import { bankAvailability, confirmBankMagnitude } from '../src/bank-availability.js';
const money = (cents: string) => ({ currency: 'BRL' as const, cents });
describe('shared bank source availability', () => {
  it('requires explicit magnitude without inferring direction from sign', () => {
    for (const original of ['10001', '-10001']) expect(() => confirmBankMagnitude(original, money('10001'))).not.toThrow();
    expect(() => confirmBankMagnitude('-9223372036854775808', money('9223372036854775808'))).toThrow();
    for (const cents of ['0', '-1', '1.2', '10000']) expect(() => confirmBankMagnitude('10001', money(cents))).toThrow();
  });
  it('shares exact active reservations from all consumers and distinguishes unknown from zero', () => {
    const source = { original: '10001', amount: money('10001') };
    expect(bankAvailability('10001', 'BRL', null, []).available).toEqual({ state: 'unknown' });
    expect(bankAvailability('10001', 'BRL', source, [money('6000'), money('4001')])).toEqual({ current: true, allocated: money('10001'), available: { state: 'available', amount: money('0') } });
    expect(bankAvailability('10001', 'BRL', source, [money('6000')]).available).toEqual({ state: 'available', amount: money('4001') });
    expect(bankAvailability('10002', 'BRL', source, [money('6000')]).current).toBe(false);
    expect(bankAvailability('10001', 'USD', source, []).current).toBe(false);
    expect(bankAvailability('10001', 'BRL', source, [money('10002')]).available).toEqual({ state: 'unknown' });
    expect(() => bankAvailability('10001', 'BRL', source, [money('9223372036854775807'), money('1')])).toThrow();
  });
});
