import { createHash } from 'node:crypto';
import { monthlyIncomeCandidates, parseCivilDate, parseCents, scheduledIncomeCandidate, toMoneyDTO } from '@rovere/domain';
import type { Evidence, GenerationRange, IncomeRecurrenceDTO, RecurrenceSchedule } from '@rovere/domain';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { fail } from '../imports/validation.js';
import { incomeDetails } from './incomes.service.js';
export type Tx = Prisma.TransactionClient;
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const civil = (value: Date) => parseCivilDate(value.toISOString().slice(0, 10));
export const today = () => parseCivilDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
type RuleRow = Prisma.RecurrenceRuleGetPayload<{ include: { _count: { select: { occurrences: true } }; schedules: true } }>;
export function ruleDTO(row: RuleRow): IncomeRecurrenceDTO {
  const schedules: RecurrenceSchedule[] = row.schedules.map(item => ({ effectiveFrom: item.effectiveFrom, version: item.version, description: item.description, notes: item.notes, amount: toMoneyDTO(parseCents(item.cents.toString())), anchorDay: item.anchorDay, startsOn: civil(item.startsOn), endsOn: item.endsOn ? civil(item.endsOn) : null, evidence: item.evidence as unknown as Evidence }));
  return { id: row.id, version: row.version, cadence: 'monthly', description: row.description, notes: row.notes, amount: toMoneyDTO(parseCents(row.cents.toString())),
    anchorDay: row.anchorDay, startsOn: civil(row.startsOn), endsOn: row.endsOn ? civil(row.endsOn) : null, evidence: row.evidence as unknown as Evidence, occurrenceCount: row._count.occurrences, state: row.state as IncomeRecurrenceDTO['state'], schedules };
}
export const ruleInclude = { _count: { select: { occurrences: true } }, schedules: { orderBy: { version: 'asc' as const } } };
export async function ruleDetails(tx: Tx | Database, userId: string, id: string): Promise<IncomeRecurrenceDTO> {
  const row = await tx.recurrenceRule.findUnique({ where: { id_userId: { id, userId } }, include: ruleInclude });
  if (!row) fail(404, 'RECURRENCE_NOT_FOUND', 'Regra de receita não encontrada.'); return ruleDTO(row);
}
export async function generationPreview(tx: Tx, userId: string, ruleId: string, range: GenerationRange) {
  const rule = await ruleDetails(tx, userId, ruleId);
  const candidates = monthlyIncomeCandidates(rule, range).map(row => scheduledIncomeCandidate(rule.schedules, row.period));
  const existing = await tx.scheduledOccurrence.findMany({ where: { userId, ruleId, period: { in: candidates.map(row => row.period) } } });
  const byPeriod = new Map(existing.map(row => [row.period, row])); const rows = [];
  for (const candidate of candidates) {
    const row = byPeriod.get(candidate.period);
    const income = row ? await incomeDetails(tx, userId, row.incomeId) : null;
    rows.push({ period: candidate.period, expectedOn: candidate.expectedOn, amount: candidate.amount,
      state: row ? 'existing' as const : !candidate.eligible ? 'outside_rule' as const : rule.state === 'active' ? 'create' as const : 'blocked' as const,
      incomeId: row?.incomeId ?? null, incomeState: income?.state ?? null, income });
  }
  const counts = { create: rows.filter(row => row.state === 'create').length, existing: rows.filter(row => row.state === 'existing').length, outsideRule: rows.filter(row => row.state === 'outside_rule').length, blocked: rows.filter(row => row.state === 'blocked').length };
  return { rule, range, counts, rows, previewHash: digest({ rule, range, rows }) };
}
