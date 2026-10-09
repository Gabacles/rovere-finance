import { installmentDifference, parseCents, parseStatementPeriod, toMoneyDTO } from '@rovere/domain';
import type { Evidence, InstallmentPlanDTO } from '@rovere/domain';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';

export async function readInstallmentPlan(tx: Database | Prisma.TransactionClient, userId: string, expenseId: string): Promise<InstallmentPlanDTO | null> {
  const row = await tx.installmentPlan.findUnique({ where: { expenseId_userId: { expenseId, userId } }, include: {
    forecasts: { orderBy: { number: 'asc' }, include: { match: { include: { expenseCharge: { include: { charge: true } } } } } } } });
  if (!row) return null;
  const money = (value: bigint) => toMoneyDTO(parseCents(value.toString()));
  return { id: row.id, total: money(row.total), count: row.count, creditAccountId: row.creditAccountId, firstPeriod: parseStatementPeriod(row.firstPeriod), cadence: 'monthly', evidence: row.evidence as unknown as Evidence,
    forecasts: row.forecasts.map(forecast => {
      const plannedAmount = money(forecast.plannedCents); const match = forecast.match; const charge = match?.expenseCharge.charge;
      const actual = match && charge ? { confirmedAmount: money(match.confirmedCents), evidence: match.evidence as unknown as Evidence,
        charge: { id: charge.id, creditAccountId: charge.creditAccountId, statementId: charge.statementId, postedOn: charge.postedOn.toISOString().slice(0, 10),
          description: charge.description, amount: money(charge.cents), installment: charge.installment, notes: charge.notes } } : null;
      return { id: forecast.id, number: forecast.number, period: parseStatementPeriod(forecast.period), plannedAmount, state: actual ? 'recorded' : 'planned', actual,
        difference: actual ? installmentDifference(actual.confirmedAmount, plannedAmount) : null };
    }) };
}
