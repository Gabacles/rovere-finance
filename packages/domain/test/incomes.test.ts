import { describe, expect, it } from 'vitest';
import { changeIncomeFacts, incomeKnowledge, incomeTransition, normalizeIncomePatch, unknownIncomeFacts } from '../src/incomes.js';

describe('RF-027 planned incomes', () => {
  it('keeps unknown distinct from confirmed zero without inventing financial dimensions', () => {
    const unknown = unknownIncomeFacts(); expect(incomeKnowledge(unknown)).toBe('partial');
    const patch = normalizeIncomePatch({ description: ' Salário fictício ', facts: { expectedAmount: { currency: 'BRL', cents: '0' }, expectedOn: '2024-02-29' } }, true);
    expect(patch.description).toBe('Salário fictício');
    const facts = changeIncomeFacts(unknown, patch.facts, 'manual-1');
    expect(facts.expectedAmount).toEqual({ state: 'confirmed', value: { currency: 'BRL', cents: '0' }, evidence: { kind: 'user', decisionId: 'manual-1' } });
    expect(incomeKnowledge(facts)).toBe('complete'); expect(Object.keys(facts)).toEqual(['expectedOn', 'expectedAmount']);
  });
  it('preserves omitted facts/evidence and clears only explicit null', () => {
    const original = changeIncomeFacts(unknownIncomeFacts(), normalizeIncomePatch({ facts: { expectedAmount: { currency: 'BRL', cents: '9223372036854775807' }, expectedOn: '0001-01-01' } }).facts, 'one');
    expect(changeIncomeFacts(original, undefined, 'two')).toEqual(original);
    const changed = changeIncomeFacts(original, { expectedAmount: null }, 'three');
    expect(changed.expectedOn).toEqual(original.expectedOn); expect(changed.expectedAmount).toEqual({ state: 'unknown' });
    expect(original.expectedAmount.state).toBe('confirmed');
    expect(normalizeIncomePatch({ notes: null })).toEqual({ notes: null });
  });
  it.each([0, -1, '00', '+1', '-0', '-1', '1.0', '1e3', '9223372036854775808', '99999999999999999999999'])('rejects noncanonical, negative or overflowing cents %s', cents => {
    expect(() => normalizeIncomePatch({ facts: { expectedAmount: { currency: 'BRL', cents } } })).toThrow();
  });
  it.each(['2025-02-29', '2026-02-30', '0000-01-01', '10000-01-01', '2026-01-01T00:00:00Z'])('rejects invalid civil date %s', expectedOn => {
    expect(() => normalizeIncomePatch({ facts: { expectedOn } })).toThrow();
  });
  it.each([{}, { description: '' }, { description: 'x'.repeat(501) }, { notes: 0 }, { notes: 'x'.repeat(1001) }, { facts: {} }, { facts: { accountId: 'x' } }, { state: 'paid' }, { userId: 'x' }, { recurrence: {} }, { facts: { expectedAmount: { currency: 'USD', cents: '1' } } }])('rejects extra/invalid facts %j', body => {
    expect(() => normalizeIncomePatch(body)).toThrow();
  });
  it('has only planned edit and terminal explicit cancellation', () => {
    expect(incomeTransition('planned', 'edit')).toBe('planned'); expect(incomeTransition('planned', 'cancel')).toBe('cancelled');
    expect(() => incomeTransition('cancelled', 'edit')).toThrow(); expect(() => incomeTransition('cancelled', 'cancel')).toThrow();
  });
});
