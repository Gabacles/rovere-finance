import { describe, expect, it } from 'vitest';
import { compatibleFinancialValues, confirmationValue, effectiveCandidate, similarityKey } from '../src/import-confirmation.js';
import type { FinancialValue } from '../src/import-confirmation.js';
import type { ImportCandidate } from '../src/import-contracts.js';
import { changeCorrections } from '../src/import-review.js';
const unknown = { state: 'unknown' } as const;
const a: FinancialValue = { kind: 'card', accountId: 'credit', statementId: 'statement', cardId: null, postedOn: '2026-10-08', description: 'Fictitious', cents: '-12000', installment: unknown };
describe('financial confirmation boundaries', () => {
  it('compares identity facts while preserving personal description and partial knowledge', () => {
    expect(compatibleFinancialValues(a, { ...a, description: 'Manually changed', cardId: 'known' })).toBe(true);
    for (const patch of [{ cents: '-12001' }, { postedOn: '2026-10-09' }, { statementId: 'other' }, { accountId: 'other' }]) expect(compatibleFinancialValues(a, { ...a, ...patch })).toBe(false);
    expect(compatibleFinancialValues({ ...a, cardId: 'one' }, { ...a, cardId: 'two' })).toBe(false);
  });
  it('keeps similarity separate from identity and never creates a purchase total', () => {
    expect(similarityKey(a)).toBe(similarityKey({ ...a, description: ' FICTITIOUS ' }));
    expect(similarityKey(a)).not.toBe(similarityKey({ ...a, cents: '12000' }));
    expect(a.installment).toEqual(unknown);
  });
  it('requires confirmed statement before card persistence and exposes period conflicts', () => {
    const original = { rowId: 'row', sourceRecordId: 'source', postedOn: unknown, amount: unknown, description: unknown, externalId: unknown, installment: unknown, statementId: unknown,
      suggestions: [], issues: [{ code: 'STATEMENT_PERIOD_REQUIRED', field: 'statementPeriod', blocking: true }] } as ImportCandidate;
    const target = { kind: 'card', financialAccountId: null, creditAccountId: 'credit', cardId: null, statementId: 'statement', periodOverride: false, decisionId: 'decision', statement: { period: '2026-10' } };
    const corrections = changeCorrections({}, { postedOn: '2026-10-08', description: 'Fictitious', amount: { currency: 'BRL', cents: '-12000' } }, 'decision');
    const candidate = effectiveCandidate(original, corrections, unknown, target);
    expect(confirmationValue(candidate, target).cents).toBe('-12000'); expect(confirmationValue(candidate, target).installment).toEqual(unknown);
    const conflict = effectiveCandidate(original, corrections, { state: 'confirmed', value: '2026-11', evidence: { kind: 'source', sourceRecordId: 'source', field: 'period' } }, target);
    expect(() => confirmationValue(conflict, target)).toThrow('ROW_INCOMPLETE');
    expect(() => confirmationValue(candidate, { ...target, statementId: null })).toThrow('DESTINATION_REQUIRED');
  });
});
