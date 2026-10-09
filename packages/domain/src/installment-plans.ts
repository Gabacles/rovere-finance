import { allocateCents, parseCents, subtractCents, toMoneyDTO } from './money.js';
import type { MoneyDTO } from './money.js';
import { parseStatementPeriod } from './statement-period.js';
import type { StatementPeriod } from './statement-period.js';
import type { Evidence, InstallmentReference, KnownValue } from './import-contracts.js';
import type { ExpenseChargeDTO } from './expenses.js';

export class InstallmentError extends TypeError {
  constructor(public readonly field: string) { super('Invalid installment decision.'); }
}
export interface InstallmentPlanInput { total: MoneyDTO; count: number; creditAccountId: string; firstPeriod: StatementPeriod; cadence: 'monthly' }
export interface ForecastValue { number: number; period: StatementPeriod; plannedAmount: MoneyDTO }
export interface InstallmentForecastDTO extends ForecastValue {
  id: string; state: 'planned' | 'recorded';
  actual: { charge: ExpenseChargeDTO; confirmedAmount: MoneyDTO; evidence: Evidence } | null;
  difference: MoneyDTO | null;
}
export interface InstallmentPlanDTO extends InstallmentPlanInput { id: string; evidence: Evidence; forecasts: InstallmentForecastDTO[] }
function object(value: unknown, fields: string[], field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw new InstallmentError(field);
  return value as Record<string, unknown>;
}
export function installmentNumber(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 10000) throw new InstallmentError('number');
  return value as number;
}
export function installmentMoney(value: unknown): MoneyDTO {
  try {
    const data = object(value, ['currency', 'cents'], 'amount'); const cents = parseCents(data.cents as string);
    if (data.currency !== 'BRL' || cents < 0n) throw new TypeError();
    return toMoneyDTO(cents);
  } catch { throw new InstallmentError('amount'); }
}
export function normalizeInstallmentPlan(value: unknown): InstallmentPlanInput {
  const data = object(value, ['total', 'count', 'creditAccountId', 'firstPeriod', 'cadence'], 'plan');
  if (typeof data.creditAccountId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(data.creditAccountId)) throw new InstallmentError('creditAccountId');
  if (data.cadence !== 'monthly') throw new InstallmentError('cadence');
  let firstPeriod: StatementPeriod;
  try { firstPeriod = parseStatementPeriod(data.firstPeriod as string); } catch { throw new InstallmentError('firstPeriod'); }
  const plan: InstallmentPlanInput = { total: installmentMoney(data.total), count: installmentNumber(data.count), creditAccountId: data.creditAccountId, firstPeriod, cadence: 'monthly' };
  // Validate the whole explicit calendar before persistence.
  installmentPeriod(firstPeriod, plan.count - 1);
  return plan;
}
export function installmentPeriod(firstPeriod: StatementPeriod, offset: number): StatementPeriod {
  const initial = parseStatementPeriod(firstPeriod);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= 10000) throw new InstallmentError('period');
  const month = Number(initial.slice(5, 7)) - 1 + offset;
  const year = Number(initial.slice(0, 4)) + Math.floor(month / 12);
  try { return parseStatementPeriod(`${String(year).padStart(4, '0')}-${String(month % 12 + 1).padStart(2, '0')}`); }
  catch { throw new InstallmentError('period'); }
}
export function installmentForecasts(plan: InstallmentPlanInput): ForecastValue[] {
  return allocateCents(parseCents(plan.total.cents), plan.count).map((cents, offset) => ({ number: offset + 1, period: installmentPeriod(plan.firstPeriod, offset), plannedAmount: toMoneyDTO(cents) }));
}
/** The user confirms the relationship and magnitude; original direction/nature is never inferred or overwritten. */
export function validateInstallmentMatch(plan: Pick<InstallmentPlanInput, 'count' | 'creditAccountId'>, forecast: ForecastValue,
  charge: { creditAccountId: string; period: string; cents: string; installment: KnownValue<InstallmentReference> }, amount: MoneyDTO): void {
  const confirmed = parseCents(installmentMoney(amount).cents); const original = parseCents(charge.cents);
  if (confirmed !== (original < 0n ? -original : original)) throw new InstallmentError('amount');
  if (charge.creditAccountId !== plan.creditAccountId) throw new InstallmentError('creditAccountId');
  if (charge.period !== forecast.period) throw new InstallmentError('period');
  if (charge.installment.state === 'confirmed') {
    if (charge.installment.value.number !== forecast.number) throw new InstallmentError('number');
    if (charge.installment.value.total.state === 'confirmed' && charge.installment.value.total.value !== plan.count) throw new InstallmentError('count');
  }
}
export function installmentDifference(actual: MoneyDTO, planned: MoneyDTO): MoneyDTO {
  return toMoneyDTO(subtractCents(parseCents(actual.cents), parseCents(planned.cents)));
}
