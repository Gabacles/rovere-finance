import { describe, expect, it } from 'vitest';
import { changeStatementFacts, unknownStatementFacts } from '../src/statement-facts.js';

describe('explicit statement knowledge', () => {
  it('does not invent zero, dates or an open cycle', () => {
    const facts = unknownStatementFacts(); expect(Object.values(facts).every(value => value.state === 'unknown')).toBe(true);
    const closed = changeStatementFacts(facts, { cycle: 'closed' }, 'decision');
    expect(closed.cycle).toMatchObject({ state: 'confirmed', value: 'closed' }); expect(closed.closingOn.state).toBe('unknown'); expect(closed.declaredTotal.state).toBe('unknown');
  });
  it('preserves untouched facts and distinguishes explicit zero from absence', () => {
    const previous = changeStatementFacts(unknownStatementFacts(), { closingOn: '2026-09-30' }, 'first');
    const next = changeStatementFacts(previous, { declaredTotal: { currency: 'BRL', cents: '0' } }, 'second');
    expect(next.closingOn).toEqual(previous.closingOn); expect(previous.declaredTotal.state).toBe('unknown');
    expect(next.declaredTotal).toEqual({ state: 'confirmed', value: { currency: 'BRL', cents: '0' }, evidence: { kind: 'user', decisionId: 'second' } });
  });
  it('clears only an explicitly removed assertion', () => {
    const previous = changeStatementFacts(unknownStatementFacts(), { cycle: 'closed', declaredTotal: { currency: 'BRL', cents: '-1234' } }, 'first');
    const next = changeStatementFacts(previous, { declaredTotal: null }, 'second');
    expect(next.declaredTotal).toEqual({ state: 'unknown' }); expect(next.cycle).toEqual(previous.cycle); expect(previous.declaredTotal.state).toBe('confirmed');
  });
  it('supports exact monetary and Gregorian boundaries without relating them to invoice month', () => {
    const facts = changeStatementFacts(unknownStatementFacts(), { closingOn: '0001-01-01', dueOn: '9999-12-31', declaredTotal: { currency: 'BRL', cents: '9223372036854775807' } }, 'decision');
    expect(facts.closingOn).toMatchObject({ value: '0001-01-01' }); expect(facts.declaredTotal).toMatchObject({ value: { cents: '9223372036854775807' } });
    expect(changeStatementFacts(facts, { declaredTotal: { currency: 'BRL', cents: '-9223372036854775808' } }, 'next').declaredTotal).toMatchObject({ value: { cents: '-9223372036854775808' } });
  });
  it('rejects invalid dates, floating/noncanonical money, payment states and unsolicited fields', () => {
    for (const patch of [{}, [], { dueOn: '2026-02-30' }, { closingOn: '0000-01-01' }, { cycle: 'paid' }, { period: '2026-11' },
      { declaredTotal: { currency: 'USD', cents: '1' } }, { declaredTotal: { currency: 'BRL', cents: 1.2 } }, { declaredTotal: { currency: 'BRL', cents: '-0' } },
      { declaredTotal: { currency: 'BRL', cents: '9223372036854775808' } }]) expect(() => changeStatementFacts(unknownStatementFacts(), patch, 'decision')).toThrow();
  });
});
