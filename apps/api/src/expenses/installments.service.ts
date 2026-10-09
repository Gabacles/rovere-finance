import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InstallmentError, installmentForecasts, installmentMoney, installmentNumber, normalizeInstallmentPlan, validateInstallmentMatch } from '@rovere/domain';
import type { ExpenseDTO, InstallmentPlanInput, InstallmentReference, KnownValue, MoneyDTO } from '@rovere/domain';
import { DATABASE } from '../accounts/accounts.controller.js';
import type { Database } from '../database.js';
import { fail, json, key, object, version } from '../imports/validation.js';
import { expenseDetails } from './expenses.service.js';

type Decision = { operation: 'create-plan'; plan: InstallmentPlanInput } | { operation: 'match-installment'; number: number; chargeId: string; confirmedAmount: MoneyDTO } | { operation: 'unmatch-installment'; number: number };
function invalid(error: unknown): never { fail(400, 'INVALID_INSTALLMENT_PLAN', 'Confira total, quantidade, crédito, competências e valor efetivo em BRL.', [{ field: error instanceof InstallmentError ? error.field : 'plan', code: 'INVALID_INSTALLMENT_PLAN' }]); }
function expected(value: unknown): number {
  const result = version(value); if (result >= 2147483647) fail(400, 'INVALID_VERSION', 'Versão inválida.'); return result;
}
@Injectable()
export class InstallmentsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  create(userId: string, expenseId: string, body: unknown, token: unknown) {
    const data = object(body, ['expectedVersion', 'total', 'count', 'creditAccountId', 'firstPeriod', 'cadence']); const expectedVersion = expected(data.expectedVersion);
    const { expectedVersion: _version, ...values } = data; let plan: InstallmentPlanInput;
    try { plan = normalizeInstallmentPlan(values); } catch (error) { invalid(error); }
    return this.command(userId, expenseId, expectedVersion, key(token), { operation: 'create-plan', plan });
  }
  match(userId: string, expenseId: string, body: unknown, token: unknown) {
    const data = object(body, ['expectedVersion', 'number', 'chargeId', 'confirmedAmount']); const expectedVersion = expected(data.expectedVersion);
    if (typeof data.chargeId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(data.chargeId)) fail(400, 'INVALID_INSTALLMENT_PLAN', 'Selecione uma cobrança.');
    let number: number; let confirmedAmount: MoneyDTO;
    try { number = installmentNumber(data.number); confirmedAmount = installmentMoney(data.confirmedAmount); } catch (error) { invalid(error); }
    return this.command(userId, expenseId, expectedVersion, key(token), { operation: 'match-installment', number, chargeId: data.chargeId, confirmedAmount });
  }
  remove(userId: string, expenseId: string, ordinal: string, body: unknown, token: unknown) {
    const data = object(body, ['expectedVersion']); let number: number;
    try { if (!/^[1-9]\d{0,4}$/.test(ordinal)) throw new InstallmentError('number'); number = installmentNumber(Number(ordinal)); } catch (error) { invalid(error); }
    return this.command(userId, expenseId, expected(data.expectedVersion), key(token), { operation: 'unmatch-installment', number });
  }
  private command(userId: string, expenseId: string, expectedVersion: number, token: string, decision: Decision) {
    const request = { expenseId, expectedVersion, decision }; const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const replay = await tx.expenseCommand.findUnique({ where: { userId_key: { userId, key: token } } });
      if (replay) {
        if (replay.requestHash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outros dados.');
        return replay.result as unknown as ExpenseDTO;
      }
      const previous = await expenseDetails(tx, userId, expenseId);
      if (previous.version !== expectedVersion) fail(409, 'EXPENSE_VERSION_CONFLICT', 'A compra mudou. Recarregue os dados antes de salvar.');
      const decisionId = randomUUID(); const evidence = { kind: 'user', decisionId };
      if (decision.operation === 'create-plan') {
        if (previous.installmentPlan) fail(409, 'INSTALLMENT_PLAN_EXISTS', 'Esta compra já tem um plano confirmado.');
        if (previous.facts.total.state !== 'confirmed' || previous.facts.total.value.cents !== decision.plan.total.cents) fail(409, 'PLAN_TOTAL_REQUIRED', 'Confirme o total da compra antes de criar o plano e use o mesmo valor.');
        if (!await tx.creditAccount.findUnique({ where: { id_userId: { id: decision.plan.creditAccountId, userId } } })) fail(404, 'DESTINATION_NOT_FOUND', 'Crédito não encontrado.');
        const plan = await tx.installmentPlan.create({ data: { expenseId, userId, total: BigInt(decision.plan.total.cents), count: decision.plan.count, creditAccountId: decision.plan.creditAccountId,
          firstPeriod: decision.plan.firstPeriod, cadence: 'monthly', evidence: json(evidence) } });
        await tx.installmentForecast.createMany({ data: installmentForecasts(decision.plan).map(forecast => ({ id: randomUUID(), planId: plan.id, expenseId, userId,
          number: forecast.number, period: forecast.period, plannedCents: BigInt(forecast.plannedAmount.cents) })) });
      } else {
        const plan = previous.installmentPlan; if (!plan) fail(409, 'INSTALLMENT_PLAN_REQUIRED', 'Confirme um plano antes de conciliar parcelas.');
        const forecast = plan.forecasts.find(row => row.number === decision.number); if (!forecast) fail(404, 'FORECAST_NOT_FOUND', 'Parcela prevista não encontrada.');
        if (decision.operation === 'unmatch-installment') {
          if (!forecast.actual) fail(409, 'INSTALLMENT_NOT_MATCHED', 'Esta previsão não tem cobrança conciliada.');
          await tx.installmentMatch.delete({ where: { forecastId: forecast.id } });
        } else {
          if (forecast.actual) fail(409, 'INSTALLMENT_ALREADY_MATCHED', 'Esta parcela já tem cobrança conciliada.');
          const charge = await tx.cardCharge.findUnique({ where: { id_userId: { id: decision.chargeId, userId } }, include: { statement: { select: { period: true } } } });
          if (!charge) fail(404, 'CHARGE_NOT_FOUND', 'Cobrança não encontrada.');
          if (charge.classificationKind !== null && charge.classificationKind !== 'purchase') fail(409, 'CLASSIFICATION_DEPENDENCY', 'A natureza confirmada não corresponde a uma parcela de compra. Revise explicitamente a classificação.');
          try { validateInstallmentMatch(plan, forecast, { creditAccountId: charge.creditAccountId, period: charge.statement.period, cents: charge.cents.toString(), installment: charge.installment as unknown as KnownValue<InstallmentReference> }, decision.confirmedAmount); }
          catch (error) { fail(409, 'INSTALLMENT_INCOMPATIBLE', 'Crédito, competência, parcela ou valor confirmado não correspondem à cobrança.', [{ field: error instanceof InstallmentError ? error.field : 'charge', code: 'INSTALLMENT_INCOMPATIBLE' }]); }
          const link = await tx.expenseCharge.findUnique({ where: { chargeId: charge.id } });
          if (link && (link.userId !== userId || link.expenseId !== expenseId)) fail(409, 'CHARGE_ALREADY_LINKED', 'A cobrança já está associada a outra compra.');
          if (await tx.installmentMatch.findUnique({ where: { chargeId: charge.id } })) fail(409, 'CHARGE_ALREADY_MATCHED', 'A cobrança já está conciliada a uma parcela.');
          if (!link) await tx.expenseCharge.create({ data: { chargeId: charge.id, expenseId, userId } });
          await tx.installmentMatch.create({ data: { forecastId: forecast.id, chargeId: charge.id, expenseId, userId, confirmedCents: BigInt(decision.confirmedAmount.cents), evidence: json(evidence) } });
        }
      }
      const changed = await tx.expense.updateMany({ where: { id: expenseId, userId, version: expectedVersion }, data: { version: { increment: 1 } } });
      if (changed.count !== 1) fail(409, 'EXPENSE_VERSION_CONFLICT', 'A compra mudou. Recarregue os dados antes de salvar.');
      const result = await expenseDetails(tx, userId, expenseId);
      await tx.expenseCommand.create({ data: { id: decisionId, expenseId, userId, key: token, requestHash: hash, version: result.version, changes: json({ request, previous, current: result }), result: json(result) } });
      return result;
    }, { timeout: 60000 });
  }
}
