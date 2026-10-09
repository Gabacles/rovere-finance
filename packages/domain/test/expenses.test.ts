import { describe, expect, it } from 'vitest';
import { changeExpenseFacts, ExpenseError, expenseKnowledge, normalizeExpensePatch, unknownExpenseFacts } from '../src/expenses.js';

describe('manual purchase knowledge, independent of charges', () => {
  it('keeps absent facts unknown and confirms zero without inferring original date', () => {
    const initial = unknownExpenseFacts(); expect(expenseKnowledge(initial)).toBe('partial');
    const next = changeExpenseFacts(initial, normalizeExpensePatch({ facts: { total: { currency: 'BRL', cents: '0' } } }).facts, 'decision');
    expect(next.purchasedOn).toEqual({ state: 'unknown' }); expect(next.total).toMatchObject({ state: 'confirmed', value: { cents: '0' }, evidence: { kind: 'user', decisionId: 'decision' } });
    expect(expenseKnowledge(next)).toBe('partial');
  });
  it('tracks complete facts and explicit clearing without altering unrelated evidence', () => {
    const patch = normalizeExpensePatch({ description: ' Manual ', facts: { purchasedOn: '2024-02-29', total: { currency: 'BRL', cents: '10001' } } }, true);
    const first = changeExpenseFacts(unknownExpenseFacts(), patch.facts, 'first'); expect(expenseKnowledge(first)).toBe('complete');
    const cleared = changeExpenseFacts(first, { purchasedOn: null }, 'second'); expect(cleared.total).toEqual(first.total); expect(expenseKnowledge(cleared)).toBe('partial');
    const linked = normalizeExpensePatch({ association: { action: 'link', chargeId: 'charge-3-of-10' } });
    expect(changeExpenseFacts(cleared, linked.facts, 'third')).toEqual(cleared);
  });
  it('rejects invalid dates, floats, signed purchase totals, overflow and unexpected financial fields', () => {
    for (const value of [ { facts: { purchasedOn: '2023-02-29' } }, ...['-1', '1.2', '-0', '9223372036854775808'].map(cents => ({ facts: { total: { currency: 'BRL', cents } } })),
      { facts: { total: { currency: 'BRL', cents: 100 } } }, { facts: { total: { currency: 'USD', cents: '100' } } }, { facts: { total: { currency: 'BRL', cents: '100', inferred: true } } },
      { userId: 'other' }, { description: '' }, { facts: {} }, { association: { action: 'guess', chargeId: 'charge' } } ]) expect(() => normalizeExpensePatch(value)).toThrow(ExpenseError);
    expect(normalizeExpensePatch({ description: 'Maximum', facts: { total: { currency: 'BRL', cents: '9223372036854775807' } } }, true).facts?.total?.cents).toBe('9223372036854775807');
  });
  it('canonicalizes field order and forbids a charge association during creation', () => {
    expect(normalizeExpensePatch({ notes: '', description: ' Name ', facts: { total: null, purchasedOn: null } }, true)).toEqual(normalizeExpensePatch({ facts: { purchasedOn: null, total: null }, description: 'Name', notes: null }, true));
    expect(() => normalizeExpensePatch({ description: 'Name', association: { action: 'link', chargeId: 'charge' } }, true)).toThrow(ExpenseError);
  });
});
