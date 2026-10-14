import type { IncomeDTO } from './incomes.js';
import type { MoneyDTO } from './money.js';
import { parseCents, subtractCents, toMoneyDTO } from './money.js';
import { allocatedTotal, paymentMoney } from './statement-payments.js';

export class IncomeSettlementError extends TypeError { constructor(public readonly code: string) { super('Invalid income settlement.'); } }
export interface IncomeReceiptProgress {
  state: 'unknown' | 'unreceived' | 'partial' | 'received' | 'no_expected_amount' | 'cancelled' | 'review_required';
  received: MoneyDTO;
  pending: { state: 'unknown' } | { state: 'available'; amount: MoneyDTO };
  difference: { state: 'unknown' } | { state: 'available'; amount: MoneyDTO };
}
export function incomeReceiptProgress(state: IncomeDTO['state'], expected: MoneyDTO | null, active: readonly MoneyDTO[], current = true): IncomeReceiptProgress {
  const received = allocatedTotal(active); const paid = parseCents(received.cents); const unknown = { state: 'unknown' as const };
  if (state === 'cancelled') return { state: paid > 0n ? 'review_required' : 'cancelled', received, pending: unknown, difference: unknown };
  if (!expected) return { state: paid > 0n ? 'review_required' : 'unknown', received, pending: unknown, difference: unknown };
  const total = parseCents(paymentMoney(expected, false).cents);
  const difference = { state: 'available' as const, amount: toMoneyDTO(subtractCents(paid, total)) };
  if (!current || paid > total) return { state: 'review_required', received, pending: unknown, difference };
  return { state: total === 0n ? 'no_expected_amount' : paid === 0n ? 'unreceived' : paid === total ? 'received' : 'partial', received,
    pending: { state: 'available', amount: toMoneyDTO(subtractCents(total, paid)) }, difference };
}
export function assertIncomeSettlement(state: IncomeDTO['state'], expected: MoneyDTO | null, received: readonly MoneyDTO[], source: MoneyDTO, reservations: readonly MoneyDTO[], amount: MoneyDTO) {
  if (state !== 'planned') throw new IncomeSettlementError('INCOME_CANCELLED');
  if (!expected) throw new IncomeSettlementError('INCOME_AMOUNT_REQUIRED');
  const value = parseCents(paymentMoney(amount).cents);
  if (value > subtractCents(parseCents(paymentMoney(source).cents), parseCents(allocatedTotal(reservations).cents))) throw new IncomeSettlementError('BANK_SOURCE_EXCEEDED');
  if (value > subtractCents(parseCents(paymentMoney(expected, false).cents), parseCents(allocatedTotal(received).cents))) throw new IncomeSettlementError('INCOME_EXPECTED_EXCEEDED');
}
export function assertIncomeReceiptChange(action: 'edit' | 'cancel', received: MoneyDTO, expectedPatch: MoneyDTO | null | undefined) {
  if (parseCents(received.cents) === 0n) return;
  if (action === 'cancel') throw new IncomeSettlementError('INCOME_HAS_RECEIPTS');
  if (expectedPatch !== undefined && (expectedPatch === null || parseCents(expectedPatch.cents) < parseCents(received.cents))) throw new IncomeSettlementError('INCOME_RECEIPTS_REVIEW_REQUIRED');
}
