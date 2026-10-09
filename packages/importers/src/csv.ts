import { parse } from 'csv-parse/sync';
import { decode, normalizeRow, sourcePrefix } from './normalize.js';
import { ImportFileError, LIMITS } from './types.js';
import type { Encoding, ParsedFile } from './types.js';

export interface CsvProfile {
  readonly id: string;
  readonly encoding: Encoding;
  readonly delimiter: ',' | ';' | '\t';
  readonly headerLine: number;
  readonly dateFormat: 'YMD' | 'DMY' | 'MDY';
  readonly decimal: '.' | ',';
  readonly grouping: '.' | ',' | null;
  readonly sign: 'as-is' | 'invert';
  readonly currency: 'BRL';
  readonly kind: 'bank' | 'card';
  readonly columns: {
    readonly date: string; readonly description: string; readonly amount: string;
    readonly externalId?: string; readonly installmentNumber?: string; readonly installmentTotal?: string; readonly statementPeriod?: string;
  };
}
export function parseCsv(bytes: Uint8Array, sourceId: string, profile: CsvProfile): ParsedFile {
  sourcePrefix(sourceId);
  if (!profile || !profile.id || ![',', ';', '\t'].includes(profile.delimiter) || !['YMD', 'DMY', 'MDY'].includes(profile.dateFormat) ||
    !['.', ','].includes(profile.decimal) || ![null, '.', ','].includes(profile.grouping) || profile.grouping === profile.decimal ||
    !['as-is', 'invert'].includes(profile.sign) || profile.currency !== 'BRL' || !['bank', 'card'].includes(profile.kind) ||
    !Number.isInteger(profile.headerLine) || profile.headerLine < 1 || profile.headerLine > 100 || !profile.columns ||
    !['date', 'description', 'amount'].every(key => typeof profile.columns[key as 'date'] === 'string')) throw new ImportFileError('INVALID_CSV_PROFILE');
  const text = decode(bytes, profile.encoding);
  let records: { record: string[]; raw: string }[];
  try { records = parse(text, { delimiter: profile.delimiter, from_line: profile.headerLine, bom: true, cast: false, raw: true,
    skip_empty_lines: true, relax_column_count: true, max_record_size: LIMITS.record,
    on_record: (record, context) => { if (context.records > LIMITS.rows + 1) throw new ImportFileError('TOO_MANY_ROWS'); return record; } }) as unknown as typeof records; }
  catch (error) { if (error instanceof ImportFileError) throw error; throw new ImportFileError('INVALID_CSV_STRUCTURE'); }
  const header = records.shift()?.record.map(value => value.trim());
  const mapped = Object.values(profile.columns);
  if (!header?.length || header.some(value => !value) || new Set(header).size !== header.length || new Set(mapped).size !== mapped.length || mapped.some(value => !header.includes(value))) throw new ImportFileError('INVALID_CSV_COLUMNS');
  if (!records.length) throw new ImportFileError('EMPTY_FILE');
  const blockId = `${sourceId}:1`;
  const rows = records.map(({ record, raw }, index) => {
    const value = (column: string | undefined) => column === undefined ? undefined : record[header.indexOf(column)];
    return normalizeRow({ id: `${blockId}:${index + 1}`, blockId, ordinal: index + 1, raw,
      fields: record.map((item, column) => [header[column] ?? `extra:${column}`, item] as const),
      date: value(profile.columns.date), description: value(profile.columns.description), amount: value(profile.columns.amount),
      externalId: value(profile.columns.externalId), installmentNumber: value(profile.columns.installmentNumber), installmentTotal: value(profile.columns.installmentTotal), statementPeriod: value(profile.columns.statementPeriod),
      dateFormat: profile.dateFormat, decimal: profile.decimal, grouping: profile.grouping, invert: profile.sign === 'invert', currency: profile.currency, kind: profile.kind,
      extraIssues: record.length === header.length ? [] : [{ code: 'COLUMN_COUNT_MISMATCH', field: 'row', blocking: true }],
    });
  });
  return { format: 'csv', adapterVersion: '1', encoding: profile.encoding, sourceText: text, configuration: { profile: structuredClone(profile) },
    blocks: [{ id: blockId, kind: profile.kind, account: {}, downloadRange: {}, currency: profile.currency }], rows };
}
