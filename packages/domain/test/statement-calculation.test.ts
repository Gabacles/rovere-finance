import { describe, expect, it } from 'vitest';
import { calculateStatement, CARD_NATURES, normalizeCardClassification } from '../src/statement-calculation.js';
import type { CardNature } from '../src/statement-calculation.js';
import { changeStatementFacts, unknownStatementFacts } from '../src/statement-facts.js';
const classified = (nature: CardNature, cents: string) => ({ state: 'confirmed' as const, value: { nature, amount: { currency: 'BRL' as const, cents } }, evidence: { kind: 'user' as const, decisionId: 'fictitious' } });
const complete = () => changeStatementFacts(unknownStatementFacts(), { coverage: 'complete', declaredTotal: { currency: 'BRL', cents: '15200' } }, 'coverage');
describe('explicit card nature and current coverage', () => {
  it('keeps empty/unclassified/partial/stale totals unknown until coverage is explicitly current', () => {
    expect(calculateStatement([], unknownStatementFacts(), false)).toMatchObject({ knownSubtotal: { state: 'available', amount: { cents: '0' } }, calculatedTotal: { state: 'incomplete' }, difference: { state: 'unknown' } });
    expect(calculateStatement([], complete(), true).calculatedTotal).toMatchObject({ state: 'available', amount: { cents: '0' } });
    expect(calculateStatement([{ state: 'unknown' }], complete(), true).calculatedTotal).toMatchObject({ state: 'incomplete', reasons: ['UNCLASSIFIED_LINES'] });
    expect(calculateStatement([], complete(), false).calculatedTotal).toMatchObject({ state: 'incomplete', reasons: ['COVERAGE_STALE'] });
    expect(calculateStatement([], changeStatementFacts(complete(), { coverage: 'partial' }, 'next'), false).calculatedTotal).toMatchObject({ state: 'incomplete', reasons: ['COVERAGE_PARTIAL'] });
  });
  it('separates consumption, prior balance, credits and institution payments without cash effects', () => {
    const lines = [classified('purchase', '10000'), classified('fee', '200'), classified('interest', '100'), classified('previous_balance', '6000'), classified('other_debit', '400'), classified('refund', '1000'), classified('other_credit', '500'), classified('payment', '9000'), classified('informational', '99999')];
    const result = calculateStatement(lines, complete(), true);
    expect(result).toMatchObject({ consumptionGross: { amount: { cents: '10300' } }, reportedPayments: { amount: { cents: '9000' } }, calculatedTotal: { amount: { cents: '15200' } }, difference: { amount: { cents: '0' } }, comparison: 'equal' });
    expect(Object.keys(result.groups)).toEqual([...CARD_NATURES]); expect(result).not.toHaveProperty('paid'); expect(result).not.toHaveProperty('balance');
  });
  it('requires explicit magnitude/nature without changing direction or accepting guesses', () => {
    expect(normalizeCardClassification({ nature: 'refund', amount: { currency: 'BRL', cents: '100' } }, '-100')).toEqual({ nature: 'refund', amount: { currency: 'BRL', cents: '100' } });
    expect(normalizeCardClassification(null, '-100')).toBeNull();
    for (const value of [{ nature: 'guess', amount: { currency: 'BRL', cents: '100' } }, { nature: 'purchase', amount: { currency: 'BRL', cents: '-100' } }, { nature: 'purchase', amount: { currency: 'BRL', cents: '99' } }, { nature: 'purchase', amount: { currency: 'USD', cents: '100' } }, { nature: 'purchase', amount: { currency: 'BRL', cents: 100 } }]) expect(() => normalizeCardClassification(value, '-100')).toThrow();
    expect(() => normalizeCardClassification({ nature: 'purchase', amount: { currency: 'BRL', cents: '9223372036854775807' } }, '-9223372036854775808')).toThrow();
  });
  it('keeps signed differences and reports overflow explicitly without fictitious totals', () => {
    expect(calculateStatement([classified('purchase', '15201')], complete(), true)).toMatchObject({ difference: { amount: { cents: '-1' } }, comparison: 'different' });
    const result = calculateStatement([classified('purchase', '9223372036854775807'), classified('purchase', '1')], complete(), true); expect(result.calculatedTotal.state).toBe('overflow'); expect(result.comparison).toBe('overflow');
  });
  it('aggregates compensating credits independently of row order, checking the final result', () => {
    const lines = [classified('purchase', '9223372036854775807'), classified('purchase', '1'), classified('refund', '1')];
    for (const values of [lines, [...lines].reverse(), [lines[1]!, lines[2]!, lines[0]!]]) {
      const result = calculateStatement(values, complete(), true);
      expect(result.calculatedTotal).toMatchObject({ state: 'available', amount: { cents: '9223372036854775807' } });
      expect(result.consumptionGross.state).toBe('overflow');
    }
  });
});
