import { parseCivilDate } from './civil-date.js';
import { parseCents } from './money.js';
import { reviewedCandidate } from './import-review.js';
import type { RowCorrections } from './import-review.js';
import type { ImportCandidate, KnownValue, InstallmentReference } from './import-contracts.js';

export interface ReviewTarget {
  kind: string; financialAccountId: string | null; creditAccountId: string | null; cardId: string | null;
  statementId: string | null; periodOverride: boolean; decisionId: string | null; statement?: { period: string } | null;
}
export function effectiveCandidate(original: ImportCandidate, corrections: RowCorrections, period: KnownValue<string>, target: ReviewTarget): ImportCandidate {
  let candidate = reviewedCandidate(original, corrections); const issues = [...candidate.issues];
  if (target.kind === 'bank' && !target.financialAccountId || target.kind === 'card' && !target.creditAccountId) issues.push({ code: 'DESTINATION_REQUIRED', field: 'destination', blocking: true });
  if (target.kind === 'card') {
    if (target.statementId) {
      if (period.state === 'confirmed' && period.value !== target.statement?.period && !target.periodOverride) issues.push({ code: 'STATEMENT_PERIOD_CONFLICT', field: 'statementId', blocking: true });
      candidate = { ...candidate, statementId: { state: 'confirmed', value: target.statementId, evidence: { kind: 'user', decisionId: target.decisionId! } } };
    } else if (!issues.some(issue => issue.code === 'STATEMENT_PERIOD_REQUIRED')) issues.push({ code: 'STATEMENT_PERIOD_REQUIRED', field: 'statementId', blocking: true });
  }
  return { ...candidate, issues: target.statementId ? issues.filter(issue => issue.code !== 'STATEMENT_PERIOD_REQUIRED') : issues };
}
export type FinancialValue = {
  kind: 'bank' | 'card'; accountId: string; statementId: string | null; cardId: string | null;
  postedOn: string; description: string; cents: string; installment: KnownValue<InstallmentReference>;
};
export function confirmationValue(candidate: ImportCandidate, target: ReviewTarget): FinancialValue {
  if (candidate.issues.some(issue => issue.blocking) || candidate.postedOn.state !== 'confirmed' || candidate.description.state !== 'confirmed' || candidate.amount.state !== 'confirmed') throw new TypeError('ROW_INCOMPLETE');
  const description = candidate.description.value;
  if (!description.trim() || description.length > 500) throw new TypeError('INVALID_DESCRIPTION');
  if (candidate.amount.value.currency !== 'BRL') throw new TypeError('UNSUPPORTED_CURRENCY');
  const accountId = target.kind === 'bank' ? target.financialAccountId : target.creditAccountId;
  if (!accountId || target.kind === 'card' && !target.statementId || !['bank', 'card'].includes(target.kind)) throw new TypeError('DESTINATION_REQUIRED');
  return { kind: target.kind as 'bank' | 'card', accountId, statementId: target.kind === 'card' ? target.statementId : null,
    cardId: target.kind === 'card' ? target.cardId : null, postedOn: parseCivilDate(candidate.postedOn.value), description,
    cents: parseCents(candidate.amount.value.cents).toString(), installment: candidate.installment };
}
/** Strong identities compare financial facts, preserving the existing personal description. */
export function compatibleFinancialValues(a: FinancialValue, b: FinancialValue): boolean {
  if (a.kind !== b.kind || a.accountId !== b.accountId || a.postedOn !== b.postedOn || a.cents !== b.cents || a.statementId !== b.statementId) return false;
  if (a.kind === 'card') {
    if (a.cardId && b.cardId && a.cardId !== b.cardId) return false;
    if (a.installment.state === 'confirmed' && b.installment.state === 'confirmed') {
      if (a.installment.value.number !== b.installment.value.number) return false;
      const x = a.installment.value.total; const y = b.installment.value.total;
      if (x.state === 'confirmed' && y.state === 'confirmed' && x.value !== y.value) return false;
    }
  }
  return true;
}
/** Similarity is a suggestion; this key is never a uniqueness constraint. */
export function similarityKey(value: FinancialValue): string {
  return JSON.stringify([value.kind, value.accountId, value.statementId, value.postedOn, value.cents, value.description.trim().toLocaleLowerCase('pt-BR')]);
}
