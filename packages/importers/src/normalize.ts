import { parseCents, parseCivilDate, toMoneyDTO } from '@rovere/domain';
import type { CivilDate, ImportCandidate, KnownValue, MoneyDTO } from '@rovere/domain';
import { ImportFileError, LIMITS } from './types.js';
import type { Encoding, ParsedRow } from './types.js';

export function decode(bytes: Uint8Array, encoding: Encoding): string {
  if (bytes.byteLength > LIMITS.bytes) throw new ImportFileError('FILE_TOO_LARGE');
  if (!['utf-8', 'windows-1252'].includes(encoding)) throw new ImportFileError('UNSUPPORTED_ENCODING');
  try {
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error();
    return text.replace(/^\uFEFF/, '');
  } catch { throw new ImportFileError('INVALID_ENCODING'); }
}
export function sourcePrefix(value: string): void {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new ImportFileError('INVALID_SOURCE_ID');
}
export function decimalCents(input: string, decimal: '.' | ',', grouping: '.' | ',' | null, invert: boolean): string {
  let value = input.trim();
  if (value.length > 40 || grouping === decimal) throw new Error('INVALID_AMOUNT');
  const sign = value.startsWith('-') ? -1n : 1n;
  value = value.replace(/^[+-]/, '');
  const parts = value.split(decimal);
  if (parts.length > 2) throw new Error('INVALID_AMOUNT');
  let whole = parts[0] ?? '';
  if (grouping && whole.includes(grouping)) {
    const groups = whole.split(grouping);
    if (!/^\d{1,3}$/.test(groups[0] ?? '') || groups.slice(1).some(group => !/^\d{3}$/.test(group))) throw new Error('INVALID_AMOUNT');
    whole = groups.join('');
  }
  if (!/^\d+$/.test(whole) || (parts.length === 2 && !/^\d{1,2}$/.test(parts[1] ?? ''))) throw new Error('INVALID_AMOUNT');
  const cents = (BigInt(whole) * 100n + BigInt((parts[1] ?? '').padEnd(2, '0'))) * sign * (invert ? -1n : 1n);
  return parseCents(cents.toString()).toString();
}
export function sourceDate(input: string, format: 'YMD' | 'DMY' | 'MDY' | 'OFX'): CivilDate {
  const value = input.trim();
  if (format === 'YMD') return parseCivilDate(value);
  if (format === 'OFX') {
    const match = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})(?:\.\d{1,3})?(?:\[([+-]?\d{1,2}(?:\.\d+)?)(?::[A-Za-z0-9+-]+)?\])?)?$/.exec(value);
    if (!match || (match[4] !== undefined && (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59)) || (match[7] !== undefined && Math.abs(Number(match[7])) > 14)) throw new Error('INVALID_DATE');
    return parseCivilDate(`${match[1]}-${match[2]}-${match[3]}`);
  }
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error('INVALID_DATE');
  return parseCivilDate(`${match[3]}-${format === 'DMY' ? match[2] : match[1]}-${format === 'DMY' ? match[1] : match[2]}`);
}
const unknown = <T>(): KnownValue<T> => ({ state: 'unknown' });
export interface RowInput {
  id: string; blockId: string; ordinal: number; raw: string; fields: readonly (readonly [string, string])[];
  date: string | undefined; description: string | undefined; amount: string | undefined; currency: string | undefined;
  externalId?: string | undefined; installmentNumber?: string | undefined; installmentTotal?: string | undefined; statementPeriod?: string | undefined;
  dateFormat: 'YMD' | 'DMY' | 'MDY' | 'OFX'; decimal: '.' | ','; grouping: '.' | ',' | null; invert: boolean; kind: 'bank' | 'card';
  extraIssues?: ImportCandidate['issues'];
}
export function normalizeRow(input: RowInput): ParsedRow {
  const issues = [...(input.extraIssues ?? [])];
  const known = <T>(field: string, value: T): KnownValue<T> => ({ state: 'confirmed', value, evidence: { kind: 'source', sourceRecordId: input.id, field } });
  function field<T>(name: string, raw: string | undefined, convert: (text: string) => T): KnownValue<T> {
    if (!raw?.trim()) { issues.push({ code: 'MISSING_FIELD', field: name, blocking: true }); return unknown(); }
    try { return known(name, convert(raw)); } catch { issues.push({ code: 'INVALID_FIELD', field: name, blocking: true }); return unknown(); }
  }
  const postedOn = field('postedOn', input.date, value => sourceDate(value, input.dateFormat));
  const description = field('description', input.description, value => value.trim());
  let amount: KnownValue<MoneyDTO> = unknown();
  if (input.currency !== 'BRL') issues.push({ code: input.currency ? 'UNSUPPORTED_CURRENCY' : 'MISSING_CURRENCY', field: 'amount', blocking: true });
  else amount = field('amount', input.amount, value => toMoneyDTO(parseCents(decimalCents(value, input.decimal, input.grouping, input.invert))));
  const positiveInt = (value: string): number => {
    if (!/^\d{1,5}$/.test(value.trim()) || Number(value) < 1 || Number(value) > 10000) throw new Error();
    return Number(value);
  };
  let installment: ImportCandidate['installment'] = unknown();
  if (input.installmentNumber?.trim() || input.installmentTotal?.trim()) {
    try {
      const number = positiveInt(input.installmentNumber ?? '');
      const total = input.installmentTotal?.trim() ? positiveInt(input.installmentTotal) : undefined;
      if (total !== undefined && number > total) throw new Error();
      installment = known('installment', { number, total: total === undefined ? unknown() : known('installmentTotal', total) });
    } catch { issues.push({ code: 'INVALID_INSTALLMENT', field: 'installment', blocking: true }); }
  }
  let statementPeriod: KnownValue<string> = unknown();
  if (input.statementPeriod?.trim()) statementPeriod = field('statementPeriod', input.statementPeriod, value => {
    const period = value.trim(); parseCivilDate(`${period}-01`); return period;
  });
  if (input.kind === 'card' && statementPeriod.state === 'unknown') issues.push({ code: 'STATEMENT_PERIOD_REQUIRED', field: 'statementPeriod', blocking: true });
  const suggestions: ImportCandidate['suggestions'][number][] = [];
  const suggested = /\b(\d{1,3})\/(\d{1,3})\b/.exec(input.description ?? '');
  if (installment.state === 'unknown' && suggested && Number(suggested[1]) > 0 && Number(suggested[1]) <= Number(suggested[2])) {
    suggestions.push({ field: 'installment', proposedValue: suggested[0], reason: 'Trecho da descrição; pode ser data ou parcela. Exige confirmação.' });
  }
  return { ordinal: input.ordinal, blockId: input.blockId, source: { id: input.id, raw: input.raw, fields: input.fields }, statementPeriod,
    candidate: { rowId: input.id, sourceRecordId: input.id, postedOn, description, amount,
      externalId: input.externalId?.trim() ? known('externalId', input.externalId.trim()) : unknown(),
      installment, statementId: unknown(), suggestions, issues } };
}
