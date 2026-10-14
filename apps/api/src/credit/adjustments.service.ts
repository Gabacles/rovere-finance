import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { assertAdjustmentReversal, adjustmentReason, normalizeManualAdjustment, parseCents, paymentMoney, sumCents } from '@rovere/domain';
import type { CardClassification, ManualAdjustmentInput } from '@rovere/domain';
import { DATABASE } from '../accounts/accounts.controller.js';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { fail, json, key, object, version } from '../imports/validation.js';
import { fingerprint } from '../imports/financial-records.js';
import { expenseDetails } from '../expenses/expenses.service.js';
import { chargeDetails } from './card-classification.js';
import { statementDetails } from './statements.service.js';
type Decision = { operation: 'create' | 'reverse'; creditAccountId: string; statementId: string; expectedStatementVersion: number; data: ManualAdjustmentInput; originalChargeId?: string; expectedChargeVersion?: number; expectedOriginalStatementVersion?: number }
  | { operation: 'link_refund' | 'remove_refund'; expenseId: string; chargeId: string; expectedExpenseVersion: number; expectedChargeVersion: number; expectedStatementVersion: number; reason: string; amount?: string };
const expected = (value: unknown) => { const result = version(value); if (result >= 2147483647) fail(400, 'INVALID_VERSION', 'Versão inválida.'); return result; };
const reason = (value: unknown) => { try { return adjustmentReason(value); } catch { fail(400, 'INVALID_ADJUSTMENT_REASON', 'Informe um motivo de 1 a 1000 caracteres.'); } };
@Injectable()
export class AdjustmentsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  create(userId: string, creditAccountId: string, statementId: string, body: unknown, token: unknown, originalChargeId?: string) {
    const data = object(body, ['expectedStatementVersion','postedOn','description','amount','classification','reason','informedConfirmed', ...(originalChargeId ? ['expectedChargeVersion','expectedOriginalStatementVersion'] : [])]);
    const { expectedStatementVersion, expectedChargeVersion, expectedOriginalStatementVersion, ...values } = data; let normalized: ManualAdjustmentInput;
    try { normalized = normalizeManualAdjustment(values); } catch { fail(400, 'INVALID_ADJUSTMENT', 'Confirme dados, natureza, magnitude, data e motivo do ajuste informado.'); }
    return this.command(userId, key(token), { operation: originalChargeId ? 'reverse' : 'create', creditAccountId, statementId, expectedStatementVersion: expected(expectedStatementVersion), data: normalized,
      ...(originalChargeId ? { originalChargeId, expectedChargeVersion: expected(expectedChargeVersion), expectedOriginalStatementVersion: expected(expectedOriginalStatementVersion) } : {}) });
  }
  refund(userId: string, expenseId: string, body: unknown, token: unknown, removeChargeId?: string) {
    const data = object(body, ['expectedExpenseVersion','expectedChargeVersion','expectedStatementVersion','reason', ...(removeChargeId ? [] : ['chargeId','amount','associationConfirmed'])]);
    const chargeId = removeChargeId ?? data.chargeId; if (typeof chargeId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(chargeId)) fail(400, 'INVALID_REFUND', 'Selecione um crédito efetivo próprio.');
    let amount: string | undefined; if (!removeChargeId) { if (data.associationConfirmed !== true) fail(400, 'INVALID_REFUND', 'Confirme a associação do estorno.'); try { amount = paymentMoney(data.amount).cents; } catch { fail(400, 'INVALID_REFUND', 'Confirme magnitude positiva em BRL.'); } }
    return this.command(userId, key(token), { operation: removeChargeId ? 'remove_refund' : 'link_refund', expenseId, chargeId, expectedExpenseVersion: expected(data.expectedExpenseVersion), expectedChargeVersion: expected(data.expectedChargeVersion), expectedStatementVersion: expected(data.expectedStatementVersion), reason: reason(data.reason), ...(amount ? { amount } : {}) });
  }
  async history(userId: string, creditAccountId?: string, statementId?: string, expenseId?: string) {
    if (expenseId) await expenseDetails(this.db, userId, expenseId);
    else if (!statementId || !creditAccountId || !await this.db.statement.findFirst({ where: { id: statementId, creditAccountId, userId } })) fail(404, 'STATEMENT_NOT_FOUND', 'Fatura não encontrada.');
    return this.db.cardAdjustmentCommand.findMany({ where: { userId, ...(expenseId ? { expenseId } : { creditAccountId: creditAccountId!, statementId: statementId! }) }, select: { id: true, changes: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 20 });
  }
  private command(userId: string, token: string, decision: Decision) {
    const hash = createHash('sha256').update(JSON.stringify(decision)).digest('hex');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const replay = await tx.cardAdjustmentCommand.findUnique({ where: { userId_key: { userId, key: token } } }); if (replay) { if (replay.requestHash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outros dados.'); return replay.result; }
      const id = randomUUID(); const evidence = json({ kind: 'user', decisionId: id }); let expenseId: string | null = null; let chargeId: string; let statementId: string; let creditAccountId: string; let previous: unknown;
      if ('data' in decision) {
        statementId = decision.statementId; creditAccountId = decision.creditAccountId;
        const statement = await tx.statement.findFirst({ where: { id: statementId, creditAccountId, userId } }); if (!statement) fail(404, 'STATEMENT_NOT_FOUND', 'Fatura não encontrada.');
        if (statement.version !== decision.expectedStatementVersion) fail(409, 'STATEMENT_VERSION_CONFLICT', 'A fatura mudou. Recarregue antes de registrar o ajuste.'); previous = statementDetails(statement);
        if (decision.operation === 'reverse') {
          const original = await tx.cardCharge.findFirst({ where: { id: decision.originalChargeId!, creditAccountId, userId }, include: { manualAdjustment: { include: { reversal: true } }, reversalOf: true, refundLink: true, statement: true } });
          if (!original?.manualAdjustment) fail(404, 'MANUAL_ADJUSTMENT_NOT_FOUND', 'Ajuste manual não encontrado.');
          if (original.version !== decision.expectedChargeVersion || original.statement.version !== decision.expectedOriginalStatementVersion) fail(409, 'ADJUSTMENT_VERSION_CONFLICT', 'O ajuste ou sua fatura mudou. Recarregue os dados.');
          if (original.manualAdjustment.reversal || original.reversalOf) fail(409, 'ADJUSTMENT_ALREADY_REVERSED', 'Não repetir reversão nem gerar cadeia automática.');
          if (original.refundLink) fail(409, 'REFUND_DEPENDENCY', 'Desassocie o estorno da compra antes de reverter o ajuste.');
          try { assertAdjustmentReversal({ nature: original.classificationKind, amount: { currency: 'BRL', cents: original.classifiedCents!.toString() } } as CardClassification, decision.data.classification); } catch { fail(409, 'ADJUSTMENT_REVERSAL_INCOMPATIBLE', 'Confirme efeito contrário e mesma magnitude do ajuste original.'); }
          previous = { statement: previous, original: chargeDetails(original) };
          await tx.cardCharge.update({ where: { id: original.id }, data: { version: { increment: 1 } } });
          if (original.statementId !== statementId) await tx.statement.update({ where: { id: original.statementId }, data: { version: { increment: 1 } } });
        }
        const data = decision.data; const row = await tx.cardCharge.create({ data: { userId, creditAccountId, statementId, postedOn: new Date(`${data.postedOn}T00:00:00Z`), description: data.description, cents: parseCents(data.amount.cents), installment: { state: 'unknown' },
          fingerprint: fingerprint({ kind: 'card', accountId: creditAccountId, statementId, cardId: null, postedOn: data.postedOn, description: data.description, cents: data.amount.cents, installment: { state: 'unknown' } }), classificationKind: data.classification.nature, classifiedCents: parseCents(data.classification.amount.cents), classificationEvidence: evidence } });
        chargeId = row.id; await tx.manualCardAdjustment.create({ data: { chargeId, creditAccountId, userId, reason: data.reason, evidence } });
        if (decision.operation === 'reverse') await tx.cardAdjustmentReversal.create({ data: { originalChargeId: decision.originalChargeId!, reversalChargeId: chargeId, creditAccountId, userId, evidence } });
      } else {
        expenseId = decision.expenseId; chargeId = decision.chargeId;
        const expense = await expenseDetails(tx, userId, expenseId); const charge = await tx.cardCharge.findUnique({ where: { id_userId: { id: chargeId, userId } }, include: { statement: true } }); if (!charge) fail(404, 'CHARGE_NOT_FOUND', 'Cobrança não encontrada.');
        if (expense.version !== decision.expectedExpenseVersion || charge.version !== decision.expectedChargeVersion || charge.statement.version !== decision.expectedStatementVersion) fail(409, 'ADJUSTMENT_VERSION_CONFLICT', 'Compra, crédito ou fatura mudou. Recarregue os dados.');
        creditAccountId = charge.creditAccountId; statementId = charge.statementId; previous = { expense, charge: chargeDetails(charge), statement: statementDetails(charge.statement) };
        const link = await tx.expenseRefund.findUnique({ where: { chargeId } });
        if (decision.operation === 'remove_refund') { if (!link || link.expenseId !== expenseId || link.userId !== userId) fail(404, 'REFUND_LINK_NOT_FOUND', 'Associação de estorno não encontrada.'); await tx.expenseRefund.delete({ where: { chargeId } }); }
        else {
          if (link) fail(409, 'REFUND_ALREADY_LINKED', 'Este crédito já tem associação de estorno.');
          if (charge.classificationKind !== 'refund' || charge.classifiedCents?.toString() !== decision.amount || await tx.cardAdjustmentReversal.findUnique({ where: { originalChargeId: chargeId } })) fail(409, 'REFUND_INCOMPATIBLE', 'Confirme uma linha de estorno efetivo com magnitude correspondente e ainda não revertida.');
          let total;
          try { total = sumCents([parseCents(expense.refunds?.refunded.cents ?? '0'), parseCents(decision.amount!)]); } catch { fail(409, 'REFUND_TOTAL_OVERFLOW', 'O conjunto de estornos excede a faixa monetária suportada. Revise as associações.'); }
          if (expense.facts.total.state === 'confirmed' && total > parseCents(expense.facts.total.value.cents)) fail(409, 'REFUND_EXCEEDS_TOTAL', 'Estornos associados superariam o total original confirmado. Revise os créditos.');
          await tx.expenseRefund.create({ data: { chargeId, creditAccountId, userId, expenseId, cents: parseCents(decision.amount!), reason: decision.reason, evidence } });
        }
        await tx.expense.update({ where: { id: expenseId }, data: { version: { increment: 1 } } }); await tx.cardCharge.update({ where: { id: chargeId }, data: { version: { increment: 1 } } });
      }
      await tx.statement.update({ where: { id: statementId }, data: { version: { increment: 1 } } });
      const result = { charge: chargeDetails(await tx.cardCharge.findUniqueOrThrow({ where: { id: chargeId } })), expense: expenseId ? await expenseDetails(tx, userId, expenseId) : null, statement: statementDetails(await tx.statement.findUniqueOrThrow({ where: { id: statementId } })) };
      await tx.cardAdjustmentCommand.create({ data: { id, userId, creditAccountId, statementId, chargeId, expenseId, key: token, requestHash: hash, changes: json({ decision, previous, current: result }), result: json(result) } }); return result;
    }, { timeout: 60000 });
  }
}
