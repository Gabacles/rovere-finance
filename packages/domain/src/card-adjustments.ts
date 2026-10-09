import { normalizeCardClassification } from './statement-calculation.js';
import type { CardClassification, CardNature } from './statement-calculation.js';
import { parseCivilDate } from './civil-date.js';
import type { CivilDate } from './civil-date.js';
import { parseCents, subtractCents, sumCents, toMoneyDTO } from './money.js';
import type { MoneyDTO } from './money.js';
export const ADJUSTMENT_NATURES = ['fee','interest','other_debit','other_credit','refund'] as const;
export class AdjustmentError extends TypeError { constructor(public readonly code: string) { super('Invalid card adjustment.'); } }
export interface ManualAdjustmentInput { postedOn: CivilDate; description: string; amount: MoneyDTO; classification: CardClassification; reason: string; informedConfirmed: true }
export function adjustmentReason(value: unknown): string { if (typeof value !== 'string' || !value.trim() || value.trim().length > 1000) throw new AdjustmentError('INVALID_ADJUSTMENT_REASON'); return value.trim(); }
export function normalizeManualAdjustment(value: unknown): ManualAdjustmentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AdjustmentError('INVALID_ADJUSTMENT');
  const data = value as Record<string, unknown>;
  try {
    if (Object.keys(data).some(key => !['postedOn','description','amount','classification','reason','informedConfirmed'].includes(key)) || data.informedConfirmed !== true || typeof data.description !== 'string' || !data.description.trim() || data.description.trim().length > 500) throw new TypeError();
    const amount = data.amount as Record<string, unknown>; if (!amount || Array.isArray(amount) || Object.keys(amount).some(key => !['currency','cents'].includes(key)) || amount.currency !== 'BRL') throw new TypeError();
    const cents = parseCents(amount.cents as string); const classification = normalizeCardClassification(data.classification, cents.toString());
    if (!classification || !ADJUSTMENT_NATURES.includes(classification.nature as typeof ADJUSTMENT_NATURES[number]) || parseCents(classification.amount.cents) <= 0n) throw new TypeError();
    return { postedOn: parseCivilDate(data.postedOn as string), description: data.description.trim(), amount: toMoneyDTO(cents), classification, reason: adjustmentReason(data.reason), informedConfirmed: true };
  } catch (error) { throw error instanceof AdjustmentError ? error : new AdjustmentError('INVALID_ADJUSTMENT'); }
}
export function oppositeAdjustmentNature(nature: CardNature): 'other_credit' | 'other_debit' {
  if (['fee','interest','other_debit'].includes(nature)) return 'other_credit';
  if (['refund','other_credit'].includes(nature)) return 'other_debit';
  throw new AdjustmentError('ADJUSTMENT_REVERSAL_INCOMPATIBLE');
}
export function assertAdjustmentReversal(original: CardClassification, reversal: CardClassification): void {
  if (reversal.nature !== oppositeAdjustmentNature(original.nature) || reversal.amount.cents !== original.amount.cents) throw new AdjustmentError('ADJUSTMENT_REVERSAL_INCOMPATIBLE');
}
export function refundCost(total: MoneyDTO | null, refunds: readonly MoneyDTO[]) {
  const refunded = toMoneyDTO(sumCents(refunds.map(value => parseCents(value.cents))));
  if (!total) return { refunded, eligibleCost: { state: 'unknown' as const }, reviewRequired: refunds.length > 0 };
  if (parseCents(refunded.cents) > parseCents(total.cents)) return { refunded, eligibleCost: { state: 'unknown' as const }, reviewRequired: true };
  return { refunded, eligibleCost: { state: 'available' as const, amount: toMoneyDTO(subtractCents(parseCents(total.cents), parseCents(refunded.cents))) }, reviewRequired: refunds.length > 0 };
}
