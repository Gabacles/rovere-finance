import { describe, expect, it } from 'vitest';
import { addCents, allocateCents, MAX_CENTS, MIN_CENTS, parseCents, subtractCents, toMoneyDTO } from '../src/money.js';

describe('exact money', () => {
  it.each(['1.2', '1,00', ' 1', '+1', '01', '-0', '', '1e3', 'NaN'])('rejects noncanonical %j', (value) => {
    expect(() => parseCents(value)).toThrow();
  });
  it('preserves amounts beyond JavaScript safe integers in the wire representation', () => {
    expect(toMoneyDTO(parseCents('9007199254740993'))).toEqual({ currency: 'BRL', cents: '9007199254740993' });
  });
  it('accepts both PostgreSQL BIGINT boundaries and rejects overflow', () => {
    expect(parseCents(MIN_CENTS.toString())).toBe(MIN_CENTS);
    expect(parseCents(MAX_CENTS.toString())).toBe(MAX_CENTS);
    expect(() => parseCents((MAX_CENTS + 1n).toString())).toThrow(RangeError);
    expect(() => parseCents((MIN_CENTS - 1n).toString())).toThrow(RangeError);
    expect(() => parseCents('9'.repeat(100))).toThrow(RangeError);
  });
  it('detects arithmetic overflow and performs exact additions/subtractions', () => {
    expect(addCents(parseCents('10'), parseCents('20'))).toBe(30n);
    expect(subtractCents(parseCents('10'), parseCents('20'))).toBe(-10n);
    expect(() => addCents(parseCents(MAX_CENTS.toString()), parseCents('1'))).toThrow(RangeError);
    expect(() => subtractCents(parseCents(MIN_CENTS.toString()), parseCents('1'))).toThrow(RangeError);
  });
  it('allocates the brief purchase and an indivisible total without losing cents', () => {
    expect(allocateCents(parseCents('100000'), 5)).toEqual([20000n, 20000n, 20000n, 20000n, 20000n]);
    expect(allocateCents(parseCents('10000'), 3)).toEqual([3334n, 3333n, 3333n]);
    expect(allocateCents(parseCents('-10000'), 3)).toEqual([-3334n, -3333n, -3333n]);
    expect(allocateCents(parseCents('0'), 3)).toEqual([0n, 0n, 0n]);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 10001])('rejects invalid part count %s', (parts) => {
    expect(() => allocateCents(parseCents('100'), parts)).toThrow(RangeError);
  });
  it('preserves sum, sign and maximum one-cent spread over a deterministic range', () => {
    for (let amount = -101; amount <= 101; amount++) {
      for (let parts = 1; parts <= 20; parts++) {
        const allocation = allocateCents(parseCents(String(amount)), parts);
        expect(allocation.reduce<bigint>((sum, item) => sum + item, 0n)).toBe(BigInt(amount));
        const sorted = [...allocation].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
        expect(sorted.at(-1)! - sorted[0]!).toBeLessThanOrEqual(1n);
        expect(allocation.every((item) => amount >= 0 ? item >= 0n : item <= 0n)).toBe(true);
      }
    }
  });
  it('allocates the negative boundary without overflowing its absolute value', () => {
    const allocation = allocateCents(parseCents(MIN_CENTS.toString()), 3);
    expect(allocation.reduce<bigint>((sum, item) => sum + item, 0n)).toBe(MIN_CENTS);
  });
});
