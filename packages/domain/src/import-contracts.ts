import type { CivilDate } from './civil-date.js';
import type { MoneyDTO } from './money.js';

/** Compile-time contracts; untrusted HTTP/file inputs still require runtime validation. */
export type Evidence =
  | { readonly kind: 'source'; readonly sourceRecordId: string; readonly field: string }
  | { readonly kind: 'user'; readonly decisionId: string };

export type KnownValue<T> =
  | { readonly state: 'unknown' }
  | { readonly state: 'confirmed'; readonly value: T; readonly evidence: Evidence };

export interface InstallmentReference {
  readonly number: number;
  readonly total: KnownValue<number>;
}

export interface ImportCandidate {
  readonly rowId: string;
  readonly sourceRecordId: string;
  readonly postedOn: KnownValue<CivilDate>;
  readonly description: KnownValue<string>;
  readonly amount: KnownValue<MoneyDTO>;
  readonly externalId: KnownValue<string>;
  readonly installment: KnownValue<InstallmentReference>;
  readonly statementId: KnownValue<string>;
  readonly suggestions: readonly {
    readonly field: 'installment' | 'statementId' | 'description';
    readonly proposedValue: string;
    readonly reason: string;
  }[];
  readonly issues: readonly { readonly code: string; readonly field: string; readonly blocking: boolean }[];
}

export type RowDecision =
  | { readonly rowId: string; readonly action: 'create'; readonly distinctFrom?: string }
  | { readonly rowId: string; readonly action: 'link'; readonly existingId: string }
  | { readonly rowId: string; readonly action: 'skip'; readonly reason: string };

export interface ConfirmImport {
  readonly batchId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}
