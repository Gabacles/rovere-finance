import type { Evidence } from './import-contracts.js';
import { parseCents, subtractCents, toMoneyDTO } from './money.js';
import type { MoneyDTO } from './money.js';
import { allocatedTotal, paymentMoney } from './statement-payments.js';

export type BankDirection = 'inflow' | 'outflow';
export interface BankSourceDTO {
  id: string; accountId: string; version: number; postedOn: string; description: string; amount: MoneyDTO;
  confirmation: { direction: BankDirection; amount: MoneyDTO; evidence: Evidence } | null;
  current: boolean; allocated: MoneyDTO;
  available: { state: 'unknown' } | { state: 'available'; amount: MoneyDTO };
}
export class BankAvailabilityError extends TypeError { constructor(public readonly code: string) { super('Invalid bank source decision.'); } }
/** The sign is retained as evidence. Only an explicit command defines direction. */
export function confirmBankMagnitude(original: string, confirmed: MoneyDTO): void {
  const raw = parseCents(original); const magnitude = parseCents(paymentMoney(confirmed).cents);
  if (magnitude !== (raw < 0n ? -raw : raw)) throw new BankAvailabilityError('BANK_AMOUNT_MISMATCH');
}
export function bankAvailability(original: string, currency: string, confirmation: { original: string; amount: MoneyDTO } | null, reservations: readonly MoneyDTO[]) {
  const allocated = allocatedTotal(reservations);
  const current = !!confirmation && currency === 'BRL' && confirmation.original === original && parseCents(allocated.cents) <= parseCents(confirmation.amount.cents);
  return { current, allocated, available: current && confirmation ? { state: 'available' as const, amount: toMoneyDTO(subtractCents(parseCents(confirmation.amount.cents), parseCents(allocated.cents))) } : { state: 'unknown' as const } };
}
