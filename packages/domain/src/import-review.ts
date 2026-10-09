import { parseCivilDate } from './civil-date.js';
import { parseCents, toMoneyDTO } from './money.js';
import type { ImportCandidate, KnownValue } from './import-contracts.js';

export type RowCorrections = Partial<Pick<ImportCandidate, 'postedOn' | 'description' | 'amount' | 'installment'>>;
export function changeCorrections(previous: RowCorrections, patch: unknown, decisionId: string): RowCorrections {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Invalid corrections.');
  const result = { ...previous };
  const confirmed = <T>(value: T): KnownValue<T> => ({ state: 'confirmed', value, evidence: { kind: 'user', decisionId } });
  for (const [field, value] of Object.entries(patch)) {
    if (!['postedOn', 'description', 'amount', 'installment'].includes(field)) throw new TypeError('Unknown correction.');
    if (value === null) { delete result[field as keyof RowCorrections]; continue; }
    if (field === 'postedOn') result.postedOn = confirmed(parseCivilDate(value as string));
    if (field === 'description') {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 500) throw new TypeError('Invalid description.');
      result.description = confirmed(value.trim());
    }
    if (field === 'amount') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid amount.');
      const money = value as Record<string, unknown>;
      if (Object.keys(money).some(key => !['currency', 'cents'].includes(key)) || money.currency !== 'BRL') throw new TypeError('Invalid currency.');
      result.amount = confirmed(toMoneyDTO(parseCents(money.cents as string)));
    }
    if (field === 'installment') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid installment.');
      const parts = value as Record<string, unknown>;
      if (Object.keys(parts).some(key => !['number', 'total'].includes(key)) || !Number.isInteger(parts.number) || (parts.number as number) < 1 || (parts.number as number) > 10000) throw new TypeError('Invalid installment.');
      const total = parts.total;
      if (total !== undefined && total !== null && (!Number.isInteger(total) || (total as number) < (parts.number as number) || (total as number) > 10000)) throw new TypeError('Invalid total.');
      result.installment = confirmed({ number: parts.number as number, total: total === undefined || total === null ? { state: 'unknown' } : confirmed(total as number) });
    }
  }
  return result;
}
export function reviewedCandidate(original: ImportCandidate, corrections: RowCorrections): ImportCandidate {
  return { ...original, ...corrections, issues: original.issues.filter(issue => !Object.hasOwn(corrections, issue.field)) };
}
