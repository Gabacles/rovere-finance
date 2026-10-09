import { createHash } from 'node:crypto';
import { parseCents, toMoneyDTO } from '@rovere/domain';
import type { CardClassification, CardNature, Evidence, KnownValue } from '@rovere/domain';
import type { CardCharge } from '../generated/prisma/client.js';

export function classification(row: Pick<CardCharge, 'classificationKind' | 'classifiedCents' | 'classificationEvidence'>): KnownValue<CardClassification> {
  if (row.classificationKind === null || row.classifiedCents === null) return { state: 'unknown' };
  return { state: 'confirmed', value: { nature: row.classificationKind as CardNature, amount: toMoneyDTO(parseCents(row.classifiedCents.toString())) }, evidence: row.classificationEvidence as unknown as Evidence };
}
export function chargeDetails(row: CardCharge) {
  return { id: row.id, creditAccountId: row.creditAccountId, statementId: row.statementId, cardId: row.cardId, postedOn: row.postedOn.toISOString().slice(0, 10),
    description: row.description, amount: toMoneyDTO(parseCents(row.cents.toString())), installment: row.installment, notes: row.notes, version: row.version, classification: classification(row) };
}
/** Financial set only: descriptions and notes are not completeness signals. */
export function lineSetSnapshot(rows: readonly CardCharge[]) {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id)).map(row => [row.id, row.version, row.cents.toString(), row.currency, row.classificationKind, row.classifiedCents?.toString() ?? null]);
}
export function lineSetHash(rows: readonly CardCharge[]): string { return createHash('sha256').update(JSON.stringify(lineSetSnapshot(rows))).digest('hex'); }
