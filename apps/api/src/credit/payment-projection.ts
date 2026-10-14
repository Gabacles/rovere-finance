import { createHash } from 'node:crypto';
import { calculateStatement, parseCents, paymentProgress, toMoneyDTO } from '@rovere/domain';
import type { BankPaymentSourceDTO, Evidence, MoneyDTO, PaymentBasisKind, PaymentCandidate, StatementPaymentsDTO } from '@rovere/domain';
import type { Prisma } from '../generated/prisma/client.js';
import { fail } from '../imports/validation.js';
import { classification, lineSetHash, lineSetSnapshot } from './card-classification.js';
import { statementDetails } from './statements.service.js';
import { bankSource } from '../accounts/bank-availability.js';
type Tx = Prisma.TransactionClient;
export const money = (value: bigint): MoneyDTO => toMoneyDTO(parseCents(value.toString()));

export async function paymentContext(tx: Tx, userId: string, creditAccountId: string, statementId: string) {
  const row = await tx.statement.findFirst({ where: { id: statementId, creditAccountId, userId }, include: { paymentBasis: true } });
  if (!row) fail(404, 'STATEMENT_NOT_FOUND', 'Fatura não encontrada.');
  const lines = await tx.cardCharge.findMany({ where: { statementId, creditAccountId, userId } }); const facts = statementDetails(row).facts;
  const calculation = calculateStatement(lines.map(classification), facts, row.coverage === 'complete' && row.coverageHash === lineSetHash(lines));
  const previous = calculation.groups.previous_balance.total;
  const blockers = previous.state === 'overflow' || previous.state === 'available' && parseCents(previous.amount.cents) > 0n ? ['PREVIOUS_BALANCE_REVIEW_REQUIRED'] : [];
  const snapshot = { declaredTotal: facts.declaredTotal, coverage: facts.coverage, coverageHash: row.coverageHash, lines: lineSetSnapshot(lines), calculatedTotal: calculation.calculatedTotal };
  const candidate = (kind: PaymentBasisKind, total: MoneyDTO | null): PaymentCandidate | null => {
    if (!total || parseCents(total.cents) < 0n || blockers.length) return null;
    return { kind, total, referenceHash: createHash('sha256').update(JSON.stringify({ kind, total, snapshot })).digest('hex') };
  };
  const candidates = { declared: candidate('declared', facts.declaredTotal.state === 'confirmed' ? facts.declaredTotal.value : null), calculated: candidate('calculated', calculation.calculatedTotal.state === 'available' ? calculation.calculatedTotal.amount : null) };
  return { row, candidates, blockers, snapshot };
}
export async function bankPaymentSource(tx: Tx, userId: string, id: string): Promise<BankPaymentSourceDTO> {
  const source = await bankSource(tx, userId, id); const outflow = source.confirmation?.direction === 'outflow';
  const { confirmation, ...value } = source;
  return { ...value, confirmedOutflow: outflow && confirmation ? { amount: confirmation.amount, evidence: confirmation.evidence } : null,
    current: source.current && outflow, available: source.current && outflow ? source.available : { state: 'unknown' } };
}
export async function statementPayments(tx: Tx, userId: string, creditAccountId: string, statementId: string, page = 1): Promise<StatementPaymentsDTO> {
  const context = await paymentContext(tx, userId, creditAccountId, statementId); const basis = context.row.paymentBasis;
  const active = await tx.statementPaymentAllocation.findMany({ where: { statementId, creditAccountId, userId, reversedAt: null }, include: { source: { include: { bankEntry: true } } } });
  const sourceCurrent = active.every(value => value.source.originalCents === value.source.bankEntry.cents && value.source.bankEntry.currency === 'BRL');
  const current = !!basis && context.candidates[basis.kind as PaymentBasisKind]?.referenceHash === basis.referenceHash;
  const where = { statementId, creditAccountId, userId }; const total = await tx.statementPaymentAllocation.count({ where });
  const rows = await tx.statementPaymentAllocation.findMany({ where, include: { source: { include: { bankEntry: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 25 });
  return { statementId, creditAccountId, period: context.row.period, statementVersion: context.row.version, candidates: context.candidates,
    blockers: [...context.blockers, ...(sourceCurrent ? [] : ['PAYMENT_SOURCE_CHANGED'])], basis: basis ? { kind: basis.kind as PaymentBasisKind, total: money(basis.total), evidence: basis.evidence as unknown as Evidence, current } : null,
    progress: paymentProgress(basis ? money(basis.total) : null, current && sourceCurrent, active.map(value => money(value.cents)), basis?.excessReviewConfirmed ?? false),
    allocations: { page, total, rows: rows.map(value => ({ id: value.id, bankEntryId: value.bankEntryId, accountId: value.accountId, amount: money(value.cents), postedOn: value.source.bankEntry.postedOn.toISOString().slice(0, 10), description: value.source.bankEntry.description, reversedAt: value.reversedAt?.toISOString() ?? null, evidence: value.evidence as unknown as Evidence })) } };
}
