import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { allocatedTotal, assertPaymentLimits, confirmOutflow, paymentMoney, PaymentRuleError } from '@rovere/domain';
import type { MoneyDTO, PaymentBasisKind } from '@rovere/domain';
import { DATABASE } from '../accounts/accounts.controller.js';
import type { Database } from '../database.js';
import { fail, json, key, object, version } from '../imports/validation.js';
import { bankPaymentSource, money, paymentContext, statementPayments } from './payment-projection.js';
type Decision = { operation: 'basis'; kind: PaymentBasisKind; referenceHash: string; beforePaymentsConfirmed: true; independentObligationConfirmed: true; preserveOverpaymentConfirmed?: true }
  | { operation: 'allocate'; bankEntryId: string; expectedBankVersion: number; confirmedOutflow: MoneyDTO; outflowConfirmed: true; amount: MoneyDTO }
  | { operation: 'reverse'; allocationId: string; expectedBankVersion: number };
const expected = (value: unknown) => { const result = version(value); if (result >= 2147483647) fail(400, 'INVALID_VERSION', 'Versão inválida.'); return result; };
function validMoney(value: unknown): MoneyDTO { try { return paymentMoney(value); } catch { fail(400, 'INVALID_PAYMENT_AMOUNT', 'Informe valor positivo, exato e em BRL.'); } }
function pageNumber(query: unknown): number { const data = object(query, ['page']); if (data.page !== undefined && (typeof data.page !== 'string' || !/^[1-9]\d{0,4}$/.test(data.page))) fail(400, 'INVALID_QUERY', 'Página inválida.'); return data.page ? Number(data.page) : 1; }
@Injectable()
export class PaymentsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  get(userId: string, creditId: string, statementId: string, query: unknown = {}) { const page = pageNumber(query); return this.db.$transaction(tx => statementPayments(tx, userId, creditId, statementId, page), { isolationLevel: 'RepeatableRead' }); }
  source(userId: string, id: string) { return this.db.$transaction(tx => bankPaymentSource(tx, userId, id), { isolationLevel: 'RepeatableRead' }); }
  async history(userId: string, creditId: string, statementId: string) { await this.get(userId, creditId, statementId); return this.db.statementPaymentCommand.findMany({ where: { userId, creditAccountId: creditId, statementId }, select: { id: true, changes: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 20 }); }
  basis(userId: string, creditId: string, statementId: string, body: unknown, token: unknown) {
    const data = object(body, ['expectedStatementVersion', 'kind', 'referenceHash', 'beforePaymentsConfirmed', 'independentObligationConfirmed', 'preserveOverpaymentConfirmed']);
    if (data.preserveOverpaymentConfirmed !== undefined && typeof data.preserveOverpaymentConfirmed !== 'boolean') fail(400, 'PAYMENT_CONFIRMATION_REQUIRED', 'Confirme explicitamente a preservação dos pagamentos.');
    if (!['declared', 'calculated'].includes(data.kind as string) || typeof data.referenceHash !== 'string' || !/^[a-f0-9]{64}$/.test(data.referenceHash) || data.beforePaymentsConfirmed !== true || data.independentObligationConfirmed !== true) fail(400, 'PAYMENT_CONFIRMATION_REQUIRED', 'Confirme a base antes de pagamentos e sua obrigação independente.');
    return this.command(userId, creditId, statementId, expected(data.expectedStatementVersion), key(token), { operation: 'basis', kind: data.kind as PaymentBasisKind, referenceHash: data.referenceHash, beforePaymentsConfirmed: true, independentObligationConfirmed: true, ...(data.preserveOverpaymentConfirmed === true ? { preserveOverpaymentConfirmed: true } : {}) });
  }
  allocate(userId: string, creditId: string, statementId: string, body: unknown, token: unknown) {
    const data = object(body, ['expectedStatementVersion', 'bankEntryId', 'expectedBankVersion', 'confirmedOutflow', 'outflowConfirmed', 'amount']);
    if (typeof data.bankEntryId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(data.bankEntryId) || data.outflowConfirmed !== true) fail(400, 'PAYMENT_CONFIRMATION_REQUIRED', 'Confirme a saída bancária escolhida.');
    return this.command(userId, creditId, statementId, expected(data.expectedStatementVersion), key(token), { operation: 'allocate', bankEntryId: data.bankEntryId, expectedBankVersion: expected(data.expectedBankVersion), confirmedOutflow: validMoney(data.confirmedOutflow), outflowConfirmed: true, amount: validMoney(data.amount) });
  }
  reverse(userId: string, creditId: string, statementId: string, allocationId: string, body: unknown, token: unknown) { const data = object(body, ['expectedStatementVersion', 'expectedBankVersion']); return this.command(userId, creditId, statementId, expected(data.expectedStatementVersion), key(token), { operation: 'reverse', allocationId, expectedBankVersion: expected(data.expectedBankVersion) }); }
  private command(userId: string, creditAccountId: string, statementId: string, expectedStatementVersion: number, commandKey: string, decision: Decision) {
    const request = { creditAccountId, statementId, expectedStatementVersion, decision }; const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const replay = await tx.statementPaymentCommand.findUnique({ where: { userId_key: { userId, key: commandKey } } });
      if (replay) { if (replay.requestHash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outros dados.'); return replay.result; }
      const context = await paymentContext(tx, userId, creditAccountId, statementId); if (context.row.version !== expectedStatementVersion) fail(409, 'STATEMENT_VERSION_CONFLICT', 'A fatura mudou. Recarregue os dados antes de salvar.');
      const previous = await statementPayments(tx, userId, creditAccountId, statementId); const decisionId = randomUUID(); const evidence = json({ kind: 'user', decisionId }); let bankEntryId: string | null = null; let accountId: string | null = null; let sourceBefore: unknown = null;
      if (decision.operation === 'basis') {
        const candidate = context.candidates[decision.kind]; if (!candidate || candidate.referenceHash !== decision.referenceHash) fail(409, 'PAYMENT_BASIS_UNAVAILABLE', 'A base mudou ou não está disponível. Confira saldo anterior, total e cobertura.');
        const excess = BigInt(candidate.total.cents) < BigInt(previous.progress.allocated.cents);
        if (excess && !decision.preserveOverpaymentConfirmed) fail(409, 'PAYMENT_TOTAL_BELOW_ALLOCATED', 'Confirme preservar os pagamentos reais e revisar o excedente, ou corrija explicitamente as alocações.');
        const data = { kind: decision.kind, total: BigInt(candidate.total.cents), referenceHash: candidate.referenceHash, evidence, snapshot: json(context.snapshot), excessReviewConfirmed: excess && decision.preserveOverpaymentConfirmed === true };
        await tx.statementPaymentBasis.upsert({ where: { statementId }, create: { statementId, userId, creditAccountId, ...data }, update: data });
      } else {
        if (decision.operation === 'reverse') {
          const allocation = await tx.statementPaymentAllocation.findFirst({ where: { id: decision.allocationId, statementId, creditAccountId, userId } }); if (!allocation) fail(404, 'PAYMENT_ALLOCATION_NOT_FOUND', 'Alocação não encontrada.');
          if (allocation.reversedAt) fail(409, 'PAYMENT_ALREADY_REVERSED', 'Esta alocação já foi revertida.'); bankEntryId = allocation.bankEntryId; accountId = allocation.accountId;
        } else { bankEntryId = decision.bankEntryId; }
        const bank = await tx.bankEntry.findUnique({ where: { id_userId: { id: bankEntryId!, userId } }, include: { paymentSource: true } }); if (!bank) fail(404, 'BANK_ENTRY_NOT_FOUND', 'Movimento bancário não encontrado.'); accountId = bank.accountId;
        if (bank.version !== decision.expectedBankVersion) fail(409, 'BANK_VERSION_CONFLICT', 'O movimento mudou. Recarregue antes de alocar.'); sourceBefore = await bankPaymentSource(tx, userId, bank.id);
        if (decision.operation === 'allocate') {
          if (!context.row.paymentBasis || !previous.basis?.current || previous.progress.state === 'review_required') fail(409, 'PAYMENT_BASIS_REVIEW_REQUIRED', 'Confirme ou revise a base da obrigação antes de alocar.');
          try { confirmOutflow(bank.cents.toString(), decision.confirmedOutflow); } catch { fail(400, 'OUTFLOW_AMOUNT_MISMATCH', 'A magnitude confirmada deve corresponder à saída bancária original.'); }
          if (bank.paymentSource && (bank.paymentSource.originalCents !== bank.cents || bank.paymentSource.confirmedCents !== BigInt(decision.confirmedOutflow.cents))) fail(409, 'PAYMENT_SOURCE_CHANGED', 'A saída confirmada mudou e exige revisão.');
          const sourceActive = await tx.statementPaymentAllocation.findMany({ where: { bankEntryId: bank.id, userId, reversedAt: null }, select: { cents: true } }); const statementActive = await tx.statementPaymentAllocation.findMany({ where: { statementId, userId, reversedAt: null }, select: { cents: true } });
          try { assertPaymentLimits(decision.confirmedOutflow, sourceActive.map(value => money(value.cents)), money(context.row.paymentBasis.total), statementActive.map(value => money(value.cents)), decision.amount); }
          catch (error) { fail(409, error instanceof PaymentRuleError ? error.code : 'PAYMENT_LIMIT_INVALID', 'O valor supera o disponível do movimento ou o saldo conhecido da fatura.'); }
          if (!bank.paymentSource) await tx.statementPaymentSource.create({ data: { bankEntryId: bank.id, accountId, userId, originalCents: bank.cents, confirmedCents: BigInt(decision.confirmedOutflow.cents), evidence } });
          await tx.statementPaymentAllocation.create({ data: { statementId, creditAccountId, userId, bankEntryId: bank.id, accountId, cents: BigInt(decision.amount.cents), evidence } });
        } else await tx.statementPaymentAllocation.update({ where: { id: decision.allocationId }, data: { reversedAt: new Date(), reversalId: decisionId } });
        const changed = await tx.bankEntry.updateMany({ where: { id: bank.id, userId, version: decision.expectedBankVersion }, data: { version: { increment: 1 } } }); if (changed.count !== 1) fail(409, 'BANK_VERSION_CONFLICT', 'O movimento mudou. Recarregue antes de alocar.');
      }
      const changed = await tx.statement.updateMany({ where: { id: statementId, creditAccountId, userId, version: expectedStatementVersion }, data: { version: { increment: 1 } } }); if (changed.count !== 1) fail(409, 'STATEMENT_VERSION_CONFLICT', 'A fatura mudou. Recarregue os dados antes de salvar.');
      const result = { statement: await statementPayments(tx, userId, creditAccountId, statementId), bankEntry: bankEntryId ? await bankPaymentSource(tx, userId, bankEntryId) : null };
      await tx.statementPaymentCommand.create({ data: { id: decisionId, userId, creditAccountId, statementId, bankEntryId, accountId, key: commandKey, requestHash: hash, changes: json({ request, previous, sourceBefore, current: result }), result: json(result) } }); return result;
    }, { timeout: 60000 });
  }
}
