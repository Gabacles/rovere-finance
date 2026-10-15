import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { assertIncomeSettlement, incomeReceiptProgress, IncomeSettlementError, parseCents, paymentMoney, toMoneyDTO } from '@rovere/domain';
import type { MoneyDTO } from '@rovere/domain';
import type { Prisma } from '../generated/prisma/client.js';
import { DATABASE } from '../accounts/accounts.controller.js';
import { bankReservations, bankSource, confirmBankSource } from '../accounts/bank-availability.js';
import type { Database } from '../database.js';
import { fail, json, key, object, version } from '../imports/validation.js';
import { incomeDetails } from './incomes.service.js';

type Tx = Prisma.TransactionClient;
const money = (value: bigint) => toMoneyDTO(parseCents(value.toString()));
const expected = (value: unknown) => { const result = version(value); if (result >= 2147483647) fail(400, 'INVALID_VERSION', 'Versão inválida.'); return result; };
function validMoney(value: unknown): MoneyDTO { try { return paymentMoney(value); } catch { fail(400, 'INVALID_SETTLEMENT_AMOUNT', 'Informe valor positivo e exato em centavos BRL.'); } }
type Decision = { action: 'allocate'; bankEntryId: string; expectedBankVersion: number; confirmedInflow: MoneyDTO; inflowConfirmed: true; amount: MoneyDTO }
  | { action: 'reverse'; settlementId: string; expectedBankVersion: number; reversalConfirmed: true };
async function projection(tx: Tx, userId: string, incomeId: string, page = 1) {
  const income = await incomeDetails(tx, userId, incomeId); const where = { incomeId, userId };
  const active = await tx.incomeSettlement.findMany({ where: { ...where, reversedAt: null }, include: { source: { include: { bankEntry: true } } } });
  const current = active.every(row => row.source.originalCents === row.source.bankEntry.cents && row.source.bankEntry.currency === 'BRL');
  const rows = await tx.incomeSettlement.findMany({ where, include: { source: { include: { bankEntry: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 25 });
  return { income, progress: incomeReceiptProgress(income.state, income.facts.expectedAmount.state === 'confirmed' ? income.facts.expectedAmount.value : null, active.map(row => money(row.cents)), current),
    allocations: { page, total: await tx.incomeSettlement.count({ where }), rows: rows.map(row => ({ id: row.id, bankEntryId: row.bankEntryId, accountId: row.accountId,
      amount: money(row.cents), postedOn: row.source.bankEntry.postedOn.toISOString().slice(0, 10), description: row.source.bankEntry.description,
      reversedAt: row.reversedAt?.toISOString() ?? null, evidence: row.evidence })) }, bankEntry: null as Awaited<ReturnType<typeof bankSource>> | null };
}
@Injectable()
export class IncomeSettlementsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  get(userId: string, id: string, query: unknown) {
    const data = object(query, ['page']);
    if (data.page !== undefined && (typeof data.page !== 'string' || !/^[1-9]\d{0,4}$/.test(data.page))) fail(400, 'INVALID_QUERY', 'Página inválida.');
    return this.db.$transaction(tx => projection(tx, userId, id, data.page ? Number(data.page) : 1), { isolationLevel: 'RepeatableRead' });
  }
  source(userId: string, id: string) { return this.db.$transaction(tx => bankSource(tx, userId, id), { isolationLevel: 'RepeatableRead' }); }
  allocate(userId: string, incomeId: string, body: unknown, token: unknown) {
    const data = object(body, ['expectedVersion', 'bankEntryId', 'expectedBankVersion', 'confirmedInflow', 'inflowConfirmed', 'amount']);
    if (typeof data.bankEntryId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(data.bankEntryId) || data.inflowConfirmed !== true) fail(400, 'INCOME_CONFIRMATION_REQUIRED', 'Confirme explicitamente a entrada bancária escolhida.');
    return this.command(userId, incomeId, expected(data.expectedVersion), key(token), { action: 'allocate', bankEntryId: data.bankEntryId, expectedBankVersion: expected(data.expectedBankVersion), confirmedInflow: validMoney(data.confirmedInflow), inflowConfirmed: true, amount: validMoney(data.amount) });
  }
  reverse(userId: string, incomeId: string, settlementId: string, body: unknown, token: unknown) {
    const data = object(body, ['expectedVersion', 'expectedBankVersion', 'reversalConfirmed']);
    if (data.reversalConfirmed !== true) fail(400, 'INCOME_CONFIRMATION_REQUIRED', 'Confirme explicitamente a reversão deste vínculo.');
    return this.command(userId, incomeId, expected(data.expectedVersion), key(token), { action: 'reverse', settlementId, expectedBankVersion: expected(data.expectedBankVersion), reversalConfirmed: true });
  }
  private command(userId: string, incomeId: string, expectedVersion: number, token: string, decision: Decision) {
    const request = { incomeId, expectedVersion, decision }; const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const replay = await tx.incomeCommand.findUnique({ where: { userId_key: { userId, key: token } } });
      if (replay) {
        if (replay.requestHash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outros dados.');
        await incomeDetails(tx, userId, replay.incomeId); return replay.result;
      }
      const previous = await projection(tx, userId, incomeId);
      if (previous.income.version !== expectedVersion) fail(409, 'INCOME_VERSION_CONFLICT', 'A previsão mudou. Recarregue antes de confirmar.');
      let bankEntryId: string;
      if (decision.action === 'reverse') {
        const row = await tx.incomeSettlement.findFirst({ where: { id: decision.settlementId, incomeId, userId } });
        if (!row) fail(404, 'INCOME_SETTLEMENT_NOT_FOUND', 'Recebimento vinculado não encontrado.');
        if (row.reversedAt) fail(409, 'INCOME_SETTLEMENT_REVERSED', 'Este vínculo já foi revertido.');
        bankEntryId = row.bankEntryId;
      } else bankEntryId = decision.bankEntryId;
      const sourceBefore = await bankSource(tx, userId, bankEntryId);
      if (sourceBefore.version !== decision.expectedBankVersion) fail(409, 'BANK_VERSION_CONFLICT', 'O movimento mudou. Recarregue antes de confirmar.');
      const decisionId = randomUUID(); let settlementId: string;
      if (decision.action === 'allocate') {
        if (previous.progress.state === 'review_required') fail(409, 'INCOME_RECEIPTS_REVIEW_REQUIRED', 'Revise a receita e suas fontes antes de alocar novos recebimentos.');
        const active = await tx.incomeSettlement.findMany({ where: { incomeId, userId, reversedAt: null }, select: { cents: true } });
        // Confirmation, limits and reservations are rolled back together on any conflict.
        await confirmBankSource(tx, userId, bankEntryId, 'inflow', decision.confirmedInflow, decisionId);
        try { assertIncomeSettlement(previous.income.state, previous.income.facts.expectedAmount.state === 'confirmed' ? previous.income.facts.expectedAmount.value : null,
          active.map(row => money(row.cents)), decision.confirmedInflow, await bankReservations(tx, userId, bankEntryId), decision.amount); }
        catch (error) { fail(409, error instanceof IncomeSettlementError ? error.code : 'INCOME_SETTLEMENT_LIMIT', 'Confira o disponível do movimento e o previsto da receita. Excedentes permanecem sem alocação até revisão explícita.'); }
        settlementId = (await tx.incomeSettlement.create({ data: { incomeId, userId, bankEntryId, accountId: sourceBefore.accountId, cents: BigInt(decision.amount.cents), evidence: json({ kind: 'user', decisionId }) } })).id;
      } else {
        settlementId = decision.settlementId;
        await tx.incomeSettlement.update({ where: { id: settlementId }, data: { reversedAt: new Date(), reversalId: decisionId } });
      }
      const changed = await tx.income.updateMany({ where: { id: incomeId, userId, version: expectedVersion }, data: { version: { increment: 1 } } });
      if (changed.count !== 1) fail(409, 'INCOME_VERSION_CONFLICT', 'A previsão mudou. Recarregue antes de confirmar.');
      const bankChanged = await tx.bankEntry.updateMany({ where: { id: bankEntryId, userId, version: decision.expectedBankVersion }, data: { version: { increment: 1 } } });
      if (bankChanged.count !== 1) fail(409, 'BANK_VERSION_CONFLICT', 'O movimento mudou. Recarregue antes de confirmar.');
      const result = { ...await projection(tx, userId, incomeId), bankEntry: await bankSource(tx, userId, bankEntryId) };
      await tx.incomeCommand.create({ data: { id: decisionId, userId, incomeId, key: token, requestHash: hash, version: result.income.version,
        changes: json({ action: decision.action, patch: {}, previous: previous.income, current: result.income, settlement: { request, settlementId, sourceBefore, current: result } }), result: json(result) } });
      return result;
    }, { timeout: 60000 });
  }
}
