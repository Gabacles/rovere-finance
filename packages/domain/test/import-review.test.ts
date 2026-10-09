import { describe, expect, it } from 'vitest';
import { changeCorrections, reviewedCandidate } from '../src/import-review.js';
import type { ImportCandidate } from '../src/import-contracts.js';

const unknown = { state: 'unknown' } as const;
const original: ImportCandidate = { rowId: 'row', sourceRecordId: 'source', postedOn: unknown, description: unknown, amount: unknown,
  externalId: unknown, installment: unknown, statementId: unknown, suggestions: [{ field: 'installment', proposedValue: '03/10', reason: 'Requires confirmation' }],
  issues: [{ code: 'INVALID_FIELD', field: 'amount', blocking: true }, { code: 'COLUMN_COUNT_MISMATCH', field: 'row', blocking: true }] };
describe('persisted review corrections', () => {
  it('preserves origin and suggestions while recording exact money and manual evidence', () => {
    const corrections = changeCorrections({}, { amount: { currency: 'BRL', cents: '9223372036854775807' }, postedOn: '2026-10-08', description: ' Correção ' }, 'decision');
    const candidate = reviewedCandidate(original, corrections);
    expect(candidate.amount).toEqual({ state: 'confirmed', value: { currency: 'BRL', cents: '9223372036854775807' }, evidence: { kind: 'user', decisionId: 'decision' } });
    expect(candidate.issues.map(value => value.code)).toEqual(['COLUMN_COUNT_MISMATCH']);
    expect(candidate.installment).toEqual(unknown); expect(candidate.suggestions).toEqual(original.suggestions); expect(original.amount).toEqual(unknown);
  });
  it('removes a correction explicitly without changing the original', () => {
    const saved = changeCorrections({}, { description: 'Manual' }, 'first');
    expect(changeCorrections(saved, {}, 'second')).toEqual(saved);
    expect(reviewedCandidate(original, changeCorrections(saved, { description: null }, 'third')).description).toEqual(unknown);
  });
  it('keeps a partial installment partial without inventing total', () => {
    expect(changeCorrections({}, { installment: { number: 3 } }, 'decision').installment).toMatchObject({ value: { number: 3, total: unknown } });
  });
  it('rejects overflow, floating money, invalid dates and unapproved fields', () => {
    for (const patch of [{ amount: { currency: 'BRL', cents: '9223372036854775808' } }, { amount: { currency: 'BRL', cents: 10.5 } },
      { amount: { currency: 'USD', cents: '1' } }, { postedOn: '2026-02-30' }, { description: ' ' }, { installment: { number: 3, total: 2 } }, { statementId: 'guess' }]) {
      expect(() => changeCorrections({}, patch, 'decision')).toThrow();
    }
  });
});
