import { parseCents, subtractCents, sumCents, toMoneyDTO } from './money.js';
import type { MoneyDTO } from './money.js';
import type { Evidence } from './import-contracts.js';

export type PaymentBasisKind = 'declared' | 'calculated';
export class PaymentRuleError extends TypeError { constructor(public readonly code: string) { super('Invalid statement payment decision.'); } }
export function paymentMoney(value: unknown, positive = true): MoneyDTO {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError();
    const data = value as Record<string, unknown>; const cents = parseCents(data.cents as string);
    if (Object.keys(data).some(key => !['currency', 'cents'].includes(key)) || data.currency !== 'BRL' || (positive ? cents <= 0n : cents < 0n)) throw new TypeError();
    return toMoneyDTO(cents);
  } catch { throw new PaymentRuleError('INVALID_PAYMENT_AMOUNT'); }
}
export function confirmOutflow(original: string, amount: MoneyDTO): void {
  const raw = parseCents(original); const magnitude = parseCents(paymentMoney(amount).cents);
  if (magnitude !== (raw < 0n ? -raw : raw)) throw new PaymentRuleError('OUTFLOW_AMOUNT_MISMATCH');
}
export function allocatedTotal(amounts: readonly MoneyDTO[]): MoneyDTO { return toMoneyDTO(sumCents(amounts.map(value => parseCents(paymentMoney(value).cents)))); }
export function assertPaymentLimits(outflow: MoneyDTO, sourceAllocations: readonly MoneyDTO[], base: MoneyDTO, statementAllocations: readonly MoneyDTO[], amount: MoneyDTO): void {
  const value = parseCents(paymentMoney(amount).cents);
  const sourceAvailable = subtractCents(parseCents(paymentMoney(outflow).cents), parseCents(allocatedTotal(sourceAllocations).cents));
  const due = subtractCents(parseCents(paymentMoney(base, false).cents), parseCents(allocatedTotal(statementAllocations).cents));
  if (value > sourceAvailable) throw new PaymentRuleError('PAYMENT_SOURCE_EXCEEDED');
  if (value > due) throw new PaymentRuleError('PAYMENT_BALANCE_EXCEEDED');
}
export type PaymentState = 'unknown' | 'unpaid' | 'partial' | 'paid' | 'no_obligation' | 'review_required' | 'credit_review_required';
export interface PaymentProgress { state: PaymentState; allocated: MoneyDTO; remaining: { state: 'unknown' } | { state: 'available'; amount: MoneyDTO }; creditExcess?: { state: 'unknown' } | { state: 'available'; amount: MoneyDTO } }
export function paymentProgress(base: MoneyDTO | null, current: boolean, amounts: readonly MoneyDTO[], excessReviewed = false): PaymentProgress {
  const allocated = allocatedTotal(amounts); const paid = parseCents(allocated.cents);
  if (!base) return { state: 'unknown', allocated, remaining: { state: 'unknown' } };
  const total = parseCents(paymentMoney(base, false).cents);
  if (current && paid > total && excessReviewed) return { state: 'credit_review_required', allocated, remaining: { state: 'available', amount: toMoneyDTO(parseCents('0')) }, creditExcess: { state: 'available', amount: toMoneyDTO(subtractCents(paid, total)) } };
  if (!current || paid > total) return { state: 'review_required', allocated, remaining: { state: 'unknown' } };
  const remaining = toMoneyDTO(subtractCents(total, paid));
  return { state: total === 0n ? 'no_obligation' : paid === 0n ? 'unpaid' : paid === total ? 'paid' : 'partial', allocated, remaining: { state: 'available', amount: remaining } };
}
export interface PaymentCandidate { kind: PaymentBasisKind; total: MoneyDTO; referenceHash: string }
export interface PaymentAllocationDTO { id: string; bankEntryId: string; accountId: string; amount: MoneyDTO; postedOn: string; description: string; reversedAt: string | null; evidence: Evidence }
export interface StatementPaymentsDTO {
  statementId: string; creditAccountId: string; period: string; statementVersion: number;
  candidates: Record<PaymentBasisKind, PaymentCandidate | null>; blockers: string[];
  basis: { kind: PaymentBasisKind; total: MoneyDTO; current: boolean; evidence: Evidence } | null;
  progress: PaymentProgress; allocations: { page: number; total: number; rows: PaymentAllocationDTO[] };
}
export interface BankPaymentSourceDTO {
  id: string; accountId: string; version: number; postedOn: string; description: string; amount: MoneyDTO;
  confirmedOutflow: { amount: MoneyDTO; evidence: Evidence } | null; current: boolean; allocated: MoneyDTO;
  available: { state: 'unknown' } | { state: 'available'; amount: MoneyDTO };
}
