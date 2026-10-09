import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { changeExpenseFacts, ExpenseError, expenseKnowledge, normalizeExpensePatch, parseCivilDate, parseCents, refundCost, toMoneyDTO, unknownExpenseFacts } from '@rovere/domain';
import type { Evidence, ExpenseDTO, ExpenseFacts, ExpensePatch, KnownValue } from '@rovere/domain';
import type { Expense, Prisma } from '../generated/prisma/client.js';
import { DATABASE } from '../accounts/accounts.controller.js';
import type { Database } from '../database.js';
import { fail, json, key, object, version } from '../imports/validation.js';
import { readInstallmentPlan } from './installment-projection.js';

type Tx = Prisma.TransactionClient;
function facts(row: Expense): ExpenseFacts {
  const evidence = row.factEvidence as unknown as Partial<Record<keyof ExpenseFacts, Evidence>>;
  const known = <T>(value: T | null, proof: Evidence | undefined): KnownValue<T> => {
    if (value === null) return { state: 'unknown' };
    if (!proof) throw new Error('EXPENSE_EVIDENCE_MISSING');
    return { state: 'confirmed', value, evidence: proof };
  };
  return { purchasedOn: known(row.purchasedOn ? parseCivilDate(row.purchasedOn.toISOString().slice(0, 10)) : null, evidence.purchasedOn),
    total: known(row.total === null ? null : toMoneyDTO(parseCents(row.total.toString())), evidence.total) };
}
function storage(facts: ExpenseFacts) {
  return { purchasedOn: facts.purchasedOn.state === 'confirmed' ? new Date(`${facts.purchasedOn.value}T00:00:00.000Z`) : null,
    total: facts.total.state === 'confirmed' ? BigInt(facts.total.value.cents) : null,
    factEvidence: json(Object.fromEntries(Object.entries(facts).filter(([, value]) => value.state === 'confirmed').map(([field, value]) => [field, value.state === 'confirmed' ? value.evidence : undefined]))) };
}
function normalize(body: unknown, creating: boolean): ExpensePatch {
  try { return normalizeExpensePatch(body, creating); }
  catch (error) { fail(400, 'INVALID_EXPENSE', 'Confira descrição, data original e total não negativo em BRL.', [{ field: error instanceof ExpenseError ? error.field : 'expense', code: 'INVALID_EXPENSE' }]); }
}
export async function expenseDetails(tx: Tx | Database, userId: string, id: string): Promise<ExpenseDTO> {
  const row = await tx.expense.findUnique({ where: { id_userId: { id, userId } }, include: { charges: { include: { charge: true }, orderBy: { chargeId: 'asc' } } } });
  if (!row) fail(404, 'EXPENSE_NOT_FOUND', 'Compra não encontrada.');
  const value = facts(row); const links = await tx.expenseRefund.findMany({ where: { expenseId: id, userId }, include: { charge: true }, orderBy: { chargeId: 'asc' } });
  const refundValues = links.map(link => toMoneyDTO(parseCents(link.cents.toString())));
  return { id: row.id, version: row.version, description: row.description, notes: row.notes, facts: value, knowledge: expenseKnowledge(value),
    refunds: { ...refundCost(value.total.state === 'confirmed' ? value.total.value : null, refundValues), rows: links.map((link, index) => ({ chargeId: link.chargeId, amount: refundValues[index]!, reason: link.reason, description: link.charge.description })) },
    installmentPlan: await readInstallmentPlan(tx, userId, id), charges: row.charges.map(({ charge }) => ({ id: charge.id, creditAccountId: charge.creditAccountId, statementId: charge.statementId,
      postedOn: charge.postedOn.toISOString().slice(0, 10), description: charge.description, amount: toMoneyDTO(parseCents(charge.cents.toString())), installment: charge.installment, notes: charge.notes })) };
}

@Injectable()
export class ExpensesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  get(userId: string, id: string) { return expenseDetails(this.db, userId, id); }
  async list(userId: string, query: unknown) {
    const data = object(query, ['page']);
    if (data.page !== undefined && (typeof data.page !== 'string' || !/^[1-9]\d{0,4}$/.test(data.page))) fail(400, 'INVALID_QUERY', 'Página inválida.');
    const page = data.page ? Number(data.page) : 1;
    const rows = await this.db.expense.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 25 });
    return { page, total: await this.db.expense.count({ where: { userId } }), rows: rows.map(row => ({ id: row.id, version: row.version, description: row.description, knowledge: expenseKnowledge(facts(row)) })) };
  }
  async history(userId: string, id: string) {
    await this.get(userId, id);
    return this.db.expenseCommand.findMany({ where: { expenseId: id, userId }, select: { id: true, version: true, changes: true, createdAt: true }, orderBy: { version: 'desc' }, take: 20 });
  }
  create(userId: string, body: unknown, token: unknown) { return this.command(userId, null, normalize(body, true), null, key(token)); }
  update(userId: string, id: string, body: unknown, token: unknown) {
    const data = object(body, ['expectedVersion', 'description', 'notes', 'facts', 'association']);
    const expectedVersion = version(data.expectedVersion);
    if (expectedVersion >= 2147483647) fail(400, 'INVALID_VERSION', 'Versão inválida.');
    const { expectedVersion: _version, ...patch } = data;
    return this.command(userId, id, normalize(patch, false), expectedVersion, key(token));
  }
  private async command(userId: string, expenseId: string | null, patch: ExpensePatch, expectedVersion: number | null, token: string) {
    const hash = createHash('sha256').update(JSON.stringify({ expenseId, expectedVersion, patch })).digest('hex');
    return this.db.$transaction(async tx => {
      // Same lock ordering as import confirmation: serialize this owner's financial decisions.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const replay = await tx.expenseCommand.findUnique({ where: { userId_key: { userId, key: token } } });
      if (replay) {
        if (replay.requestHash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outros dados.');
        return replay.result as unknown as ExpenseDTO;
      }
      const decisionId = randomUUID(); let previous: ExpenseDTO | null = null;
      if (expenseId === null) {
        const value = changeExpenseFacts(unknownExpenseFacts(), patch.facts, decisionId);
        const row = await tx.expense.create({ data: { userId, description: patch.description!, notes: patch.notes ?? null, ...storage(value) } }); expenseId = row.id;
      } else {
        previous = await expenseDetails(tx, userId, expenseId);
        if (previous.version !== expectedVersion) fail(409, 'EXPENSE_VERSION_CONFLICT', 'A compra mudou. Recarregue os dados antes de salvar.');
        if (previous.installmentPlan && patch.facts?.total !== undefined && patch.facts.total?.cents !== previous.installmentPlan.total.cents) fail(409, 'PLAN_TOTAL_LOCKED', 'O total tem um plano confirmado. Revise o plano antes de alterar o total.');
        if (previous.refunds?.rows.length && patch.facts?.total !== undefined && (patch.facts.total === null || BigInt(patch.facts.total.cents) < BigInt(previous.refunds.refunded.cents))) fail(409, 'REFUND_EXCEEDS_TOTAL', 'Revise os estornos antes de limpar ou reduzir o total abaixo do valor associado.');
        const updated = await tx.expense.updateMany({ where: { id: expenseId, userId, version: expectedVersion! },
          data: { ...(patch.description === undefined ? {} : { description: patch.description }), ...(patch.notes === undefined ? {} : { notes: patch.notes }),
            ...storage(changeExpenseFacts(previous.facts, patch.facts, decisionId)), version: { increment: 1 } } });
        if (updated.count !== 1) fail(409, 'EXPENSE_VERSION_CONFLICT', 'A compra mudou. Recarregue os dados antes de salvar.');
      }
      if (patch.association) {
        const { chargeId, action } = patch.association;
        if (!await tx.cardCharge.findUnique({ where: { id_userId: { id: chargeId, userId } } })) fail(404, 'CHARGE_NOT_FOUND', 'Cobrança não encontrada.');
        const current = await tx.expenseCharge.findUnique({ where: { chargeId } });
        if (action === 'link') {
          if (current) fail(409, 'CHARGE_ALREADY_LINKED', 'A cobrança já está associada a uma compra.');
          await tx.expenseCharge.create({ data: { userId, expenseId, chargeId } });
        } else {
          if (!current || current.userId !== userId || current.expenseId !== expenseId) fail(409, 'CHARGE_LINK_CONFLICT', 'O vínculo mudou. Recarregue os dados.');
          if (await tx.installmentMatch.findUnique({ where: { chargeId } })) fail(409, 'INSTALLMENT_MATCH_EXISTS', 'Desconcilie a parcela antes de desassociar a cobrança.');
          await tx.expenseCharge.delete({ where: { chargeId } });
        }
      }
      const result = await expenseDetails(tx, userId, expenseId);
      await tx.expenseCommand.create({ data: { id: decisionId, userId, expenseId, key: token, requestHash: hash, version: result.version, changes: json({ patch, previous, current: result }), result: json(result) } });
      return result;
    });
  }
}
