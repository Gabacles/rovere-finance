import { bankAvailability, confirmBankMagnitude, toMoneyDTO, parseCents } from '@rovere/domain';
import type { BankDirection, BankSourceDTO, Evidence, MoneyDTO } from '@rovere/domain';
import type { Prisma } from '../generated/prisma/client.js';
import { fail, json } from '../imports/validation.js';

type Tx = Prisma.TransactionClient;
const money = (value: bigint) => toMoneyDTO(parseCents(value.toString()));
/** Every consumer must include every active reservation here, under the owner's write lock. */
export async function bankReservations(tx: Tx, userId: string, bankEntryId: string): Promise<MoneyDTO[]> {
  const payments = await tx.statementPaymentAllocation.findMany({ where: { bankEntryId, userId, reversedAt: null }, select: { cents: true } });
  const incomes = await tx.incomeSettlement.findMany({ where: { bankEntryId, userId, reversedAt: null }, select: { cents: true } });
  return [...payments, ...incomes].map(value => money(value.cents));
}
export async function bankSource(tx: Tx, userId: string, id: string): Promise<BankSourceDTO> {
  const row = await tx.bankEntry.findUnique({ where: { id_userId: { id, userId } }, include: { confirmation: true } });
  if (!row) fail(404, 'BANK_ENTRY_NOT_FOUND', 'Movimento bancário não encontrado.');
  const source = row.confirmation;
  return { id, accountId: row.accountId, version: row.version, postedOn: row.postedOn.toISOString().slice(0, 10), description: row.description, amount: money(row.cents),
    confirmation: source ? { direction: source.direction as BankDirection, amount: money(source.confirmedCents), evidence: source.evidence as unknown as Evidence } : null,
    ...bankAvailability(row.cents.toString(), row.currency, source ? { original: source.originalCents.toString(), amount: money(source.confirmedCents) } : null, await bankReservations(tx, userId, id)) };
}
/** Call only inside the existing transaction after locking User and checking bank version. */
export async function confirmBankSource(tx: Tx, userId: string, id: string, direction: BankDirection, amount: MoneyDTO, decisionId: string) {
  const row = await tx.bankEntry.findUnique({ where: { id_userId: { id, userId } }, include: { confirmation: true } });
  if (!row) fail(404, 'BANK_ENTRY_NOT_FOUND', 'Movimento bancário não encontrado.');
  try { confirmBankMagnitude(row.cents.toString(), amount); } catch { fail(400, 'BANK_AMOUNT_MISMATCH', 'Confirme a magnitude integral do movimento bancário original.'); }
  if (row.confirmation) {
    if (row.confirmation.direction !== direction) fail(409, 'BANK_DIRECTION_CONFLICT', 'O movimento já tem direção diferente confirmada. Revise a origem; não reutilize como entrada e saída.');
    if (row.confirmation.originalCents !== row.cents || row.confirmation.confirmedCents !== BigInt(amount.cents)) fail(409, 'BANK_SOURCE_CHANGED', 'O movimento original mudou. Revise os vínculos antes de alocar.');
  } else await tx.bankEntryConfirmation.create({ data: { bankEntryId: id, accountId: row.accountId, userId, direction, originalCents: row.cents, confirmedCents: BigInt(amount.cents), evidence: json({ kind: 'user', decisionId }) } });
}
