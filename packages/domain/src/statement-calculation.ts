import { parseCents, subtractCents, sumCents, toMoneyDTO } from './money.js';
import type { Cents, MoneyDTO } from './money.js';
import type { KnownValue } from './import-contracts.js';
import type { StatementFacts } from './statement-facts.js';

export const CARD_NATURES = ['purchase', 'fee', 'interest', 'refund', 'other_credit', 'other_debit', 'previous_balance', 'payment', 'informational'] as const;
export type CardNature = typeof CARD_NATURES[number];
export interface CardClassification { nature: CardNature; amount: MoneyDTO }
export class ClassificationError extends TypeError { constructor(public readonly field: string) { super('Invalid card classification.'); } }
export function normalizeCardClassification(value: unknown, originalCents: string): CardClassification | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ClassificationError('classification');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !['nature', 'amount'].includes(key)) || !CARD_NATURES.includes(data.nature as CardNature)) throw new ClassificationError('nature');
  try {
    if (!data.amount || typeof data.amount !== 'object' || Array.isArray(data.amount)) throw new TypeError();
    const money = data.amount as Record<string, unknown>; const cents = parseCents(money.cents as string); const original = parseCents(originalCents);
    if (Object.keys(money).some(key => !['currency', 'cents'].includes(key)) || money.currency !== 'BRL' || cents < 0n || cents !== (original < 0n ? -original : original)) throw new TypeError();
    return { nature: data.nature as CardNature, amount: toMoneyDTO(cents) };
  } catch { throw new ClassificationError('amount'); }
}
export type AmountResult = { state: 'available'; amount: MoneyDTO } | { state: 'overflow' };
export interface StatementCalculation {
  recordCount: number; unclassifiedCount: number; coverageCurrent: boolean;
  groups: Record<CardNature, { count: number; total: AmountResult }>;
  consumptionGross: AmountResult; reportedPayments: AmountResult; knownSubtotal: AmountResult;
  calculatedTotal: AmountResult | { state: 'incomplete'; reasons: string[] };
  difference: AmountResult | { state: 'unknown' }; comparison: 'equal' | 'different' | 'unknown' | 'overflow';
}
export interface StatementSummaryDTO extends StatementCalculation { statementVersion: number; facts: StatementFacts }
const effect: Record<CardNature, bigint> = { purchase: 1n, fee: 1n, interest: 1n, refund: -1n, other_credit: -1n, other_debit: 1n, previous_balance: 1n, payment: 0n, informational: 0n };
function sum(values: readonly Cents[]): AmountResult {
  try { return { state: 'available', amount: toMoneyDTO(sumCents(values)) }; }
  catch { return { state: 'overflow' }; }
}
/** Actual statement lines only. Purchase aggregates, forecasts and cash entries are not inputs. */
export function calculateStatement(classifications: readonly KnownValue<CardClassification>[], facts: StatementFacts, coverageCurrent: boolean): StatementCalculation {
  const confirmed = classifications.flatMap(value => value.state === 'confirmed' ? [value.value] : []);
  const groups = Object.fromEntries(CARD_NATURES.map(nature => {
    const amounts = confirmed.filter(value => value.nature === nature).map(value => parseCents(value.amount.cents));
    return [nature, { count: amounts.length, total: sum(amounts) }];
  })) as StatementCalculation['groups'];
  const knownSubtotal = sum(confirmed.map(value => parseCents((parseCents(value.amount.cents) * effect[value.nature]).toString())));
  const reasons: string[] = []; const unclassifiedCount = classifications.length - confirmed.length;
  if (unclassifiedCount) reasons.push('UNCLASSIFIED_LINES');
  if (facts.coverage.state === 'unknown') reasons.push('COVERAGE_UNKNOWN');
  else if (facts.coverage.value === 'partial') reasons.push('COVERAGE_PARTIAL');
  else if (!coverageCurrent) reasons.push('COVERAGE_STALE');
  const calculatedTotal = reasons.length ? { state: 'incomplete' as const, reasons } : knownSubtotal;
  let difference: StatementCalculation['difference'] = { state: 'unknown' }; let comparison: StatementCalculation['comparison'] = 'unknown';
  if (calculatedTotal.state === 'overflow') { difference = { state: 'overflow' }; comparison = 'overflow'; }
  else if (calculatedTotal.state === 'available' && facts.declaredTotal.state === 'confirmed') {
    try { const cents = subtractCents(parseCents(facts.declaredTotal.value.cents), parseCents(calculatedTotal.amount.cents)); difference = { state: 'available', amount: toMoneyDTO(cents) }; comparison = cents === 0n ? 'equal' : 'different'; }
    catch { difference = { state: 'overflow' }; comparison = 'overflow'; }
  }
  return { recordCount: classifications.length, unclassifiedCount, coverageCurrent, groups, knownSubtotal, calculatedTotal, difference, comparison,
    consumptionGross: sum(confirmed.filter(value => ['purchase', 'fee', 'interest'].includes(value.nature)).map(value => parseCents(value.amount.cents))), reportedPayments: groups.payment.total };
}
