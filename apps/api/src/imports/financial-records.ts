import { createHash } from 'node:crypto';
import { compatibleFinancialValues, similarityKey } from '@rovere/domain';
import type { FinancialValue, KnownValue, InstallmentReference } from '@rovere/domain';
import type { Prisma } from '../generated/prisma/client.js';

export type Tx = Prisma.TransactionClient;
export type Stored = FinancialValue & { id: string; notes: string | null; fingerprint: string };
type Bank = { id: string; accountId: string; postedOn: Date; description: string; cents: bigint; notes: string | null; fingerprint: string };
type Card = { id: string; creditAccountId: string; statementId: string; cardId: string | null; postedOn: Date; description: string; cents: bigint; installment: unknown; notes: string | null; fingerprint: string };
const bankValue = (row: Bank): Stored => ({ id: row.id, kind: 'bank', accountId: row.accountId, postedOn: row.postedOn.toISOString().slice(0, 10),
  description: row.description, cents: row.cents.toString(), statementId: null, cardId: null, installment: { state: 'unknown' }, notes: row.notes, fingerprint: row.fingerprint });
const cardValue = (row: Card): Stored => ({ id: row.id, kind: 'card', accountId: row.creditAccountId, statementId: row.statementId, cardId: row.cardId,
  postedOn: row.postedOn.toISOString().slice(0, 10), description: row.description, cents: row.cents.toString(), installment: row.installment as KnownValue<InstallmentReference>, notes: row.notes, fingerprint: row.fingerprint });
export const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
export const fingerprint = (value: FinancialValue): string => digest(similarityKey(value));
function stable(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
  return JSON.stringify(value);
}
export function originNamespace(format: string, config: unknown, metadata: unknown): string {
  if (format === 'csv') return `csv:${digest(String((config as { profile: { id: string } }).profile.id))}`;
  return `ofx:${digest(stable((metadata as { account: unknown }).account))}`;
}
export async function findRecord(tx: Tx, userId: string, kind: string, id: string): Promise<Stored | null> {
  if (kind === 'bank') { const row = await tx.bankEntry.findUnique({ where: { id_userId: { id, userId } } }); return row ? bankValue(row) : null; }
  const row = await tx.cardCharge.findUnique({ where: { id_userId: { id, userId } } }); return row ? cardValue(row) : null;
}
export async function identityRecord(tx: Tx, userId: string, value: FinancialValue, namespace: string, externalId: string): Promise<Stored | null> {
  if (value.kind === 'bank') {
    const identity = await tx.bankExternalIdentity.findUnique({ where: { userId_accountId_namespace_externalId: { userId, accountId: value.accountId, namespace, externalId } }, include: { entry: true } });
    return identity ? bankValue(identity.entry) : null;
  }
  const identity = await tx.cardExternalIdentity.findUnique({ where: { userId_creditAccountId_namespace_externalId: { userId, creditAccountId: value.accountId, namespace, externalId } }, include: { charge: true } });
  return identity ? cardValue(identity.charge) : null;
}
export async function similarRecords(tx: Tx, userId: string, value: FinancialValue): Promise<Stored[]> {
  const where = { userId, fingerprint: fingerprint(value) };
  if (value.kind === 'bank') return (await tx.bankEntry.findMany({ where, orderBy: { createdAt: 'asc' }, take: 5 })).map(bankValue);
  return (await tx.cardCharge.findMany({ where, orderBy: { createdAt: 'asc' }, take: 5 })).map(cardValue);
}
export async function suggestions(tx: Tx, userId: string, value: FinancialValue, namespace: string, externalId: string | null) {
  const identity = externalId ? await identityRecord(tx, userId, value, namespace, externalId) : null;
  const similar = await similarRecords(tx, userId, value);
  return [...(identity ? [{ ...identity, reason: 'external', compatible: compatibleFinancialValues(value, identity) }] : []),
    ...similar.filter(row => row.id !== identity?.id).map(row => ({ ...row, reason: 'similar', compatible: compatibleFinancialValues(value, row) }))];
}
