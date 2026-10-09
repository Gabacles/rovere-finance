import type { ImportCandidate, KnownValue } from '@rovere/domain';

export type Encoding = 'utf-8' | 'windows-1252';
export interface SourceBlock {
  readonly id: string;
  readonly kind: 'bank' | 'card';
  readonly account: Readonly<Record<string, string>>;
  // Download interval is not an invoice period. Preserve raw values separately.
  readonly downloadRange: Readonly<Record<string, string>>;
  readonly currency: string | undefined;
}
export interface ParsedRow {
  readonly ordinal: number;
  readonly blockId: string;
  readonly source: { readonly id: string; readonly raw: string; readonly fields: readonly (readonly [string, string])[] };
  readonly candidate: ImportCandidate;
  readonly statementPeriod: KnownValue<string>;
}
export interface ParsedFile {
  readonly format: 'csv' | 'ofx-sgml' | 'ofx-xml';
  readonly adapterVersion: '1';
  readonly encoding: Encoding;
  readonly sourceText: string;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly blocks: readonly SourceBlock[];
  readonly rows: readonly ParsedRow[];
}
export class ImportFileError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'ImportFileError'; }
}
// Computational guards for the parser, not a throughput promise or retention policy.
export const LIMITS = Object.freeze({ bytes: 10 * 1024 * 1024, rows: 10000, record: 65536, depth: 32, nodes: 250000 });
