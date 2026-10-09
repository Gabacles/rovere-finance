import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { changeStatementFacts, parseCivilDate, parseCents, parseStatementPeriod, StatementFactError, toMoneyDTO } from '@rovere/domain';
import type { Evidence, KnownValue, StatementCycle, StatementDetailsDTO, StatementFacts } from '@rovere/domain';
import type { Prisma, Statement } from '../generated/prisma/client.js';
import { DATABASE } from '../accounts/accounts.controller.js';
import type { Database } from '../database.js';
import { destinationError, input } from './destinations.service.js';

function known<T>(value: T | null, evidence: Evidence | undefined): KnownValue<T> {
  if (value === null) return { state: 'unknown' };
  if (!evidence) throw new Error('STATEMENT_EVIDENCE_MISSING');
  return { state: 'confirmed', value, evidence };
}
function details(row: Statement): StatementDetailsDTO {
  const evidence = row.factEvidence as unknown as Partial<Record<keyof StatementFacts, Evidence>>;
  return { id: row.id, creditAccountId: row.creditAccountId, period: parseStatementPeriod(row.period), periodOrigin: 'manual', version: row.version,
    facts: { closingOn: known(row.closingOn ? parseCivilDate(row.closingOn.toISOString().slice(0, 10)) : null, evidence.closingOn),
      dueOn: known(row.dueOn ? parseCivilDate(row.dueOn.toISOString().slice(0, 10)) : null, evidence.dueOn),
      declaredTotal: known(row.declaredTotal === null ? null : toMoneyDTO(parseCents(row.declaredTotal.toString())), evidence.declaredTotal),
      cycle: known(row.cycle as StatementCycle | null, evidence.cycle) } };
}
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const civilDate = (value: StatementFacts['closingOn']) => value.state === 'unknown' ? null : new Date(`${value.value}T00:00:00.000Z`);

@Injectable()
export class StatementsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async get(userId: string, creditAccountId: string, statementId: string) {
    const row = await this.db.statement.findFirst({ where: { id: statementId, creditAccountId, userId } });
    if (!row) destinationError(404, 'STATEMENT_NOT_FOUND', 'Fatura não encontrada.');
    return details(row);
  }
  async history(userId: string, creditAccountId: string, statementId: string) {
    await this.get(userId, creditAccountId, statementId);
    return this.db.statementFactChange.findMany({ where: { statementId, creditAccountId, userId }, select: { id: true, version: true, changes: true, createdAt: true }, orderBy: { version: 'desc' }, take: 20 });
  }
  async update(userId: string, creditAccountId: string, statementId: string, body: unknown) {
    const data = input(body, ['expectedVersion', 'facts']); const expectedVersion = data.expectedVersion;
    if (!Number.isInteger(expectedVersion) || (expectedVersion as number) < 0 || (expectedVersion as number) >= 2147483647) destinationError(400, 'INVALID_VERSION', 'Informe uma versão válida da fatura.', 'expectedVersion');
    return this.db.$transaction(async tx => {
      const row = await tx.statement.findFirst({ where: { id: statementId, creditAccountId, userId } });
      if (!row) destinationError(404, 'STATEMENT_NOT_FOUND', 'Fatura não encontrada.');
      const previous = details(row); const decisionId = randomUUID(); let facts: StatementFacts;
      try { facts = changeStatementFacts(previous.facts, data.facts, decisionId); }
      catch (error) { destinationError(400, 'INVALID_STATEMENT_FACTS', 'Confira datas, ciclo e total declarado em BRL.', error instanceof StatementFactError ? error.field : 'facts'); }
      const evidence = Object.fromEntries(Object.entries(facts).filter(([, value]) => value.state === 'confirmed').map(([field, value]) => [field, value.state === 'confirmed' ? value.evidence : undefined]));
      const updated = await tx.statement.updateMany({ where: { id: statementId, creditAccountId, userId, version: expectedVersion as number },
        data: { version: { increment: 1 }, closingOn: civilDate(facts.closingOn), dueOn: civilDate(facts.dueOn),
          declaredTotal: facts.declaredTotal.state === 'confirmed' ? parseCents(facts.declaredTotal.value.cents) : null,
          cycle: facts.cycle.state === 'confirmed' ? facts.cycle.value : null, factEvidence: json(evidence) } });
      if (updated.count !== 1) destinationError(409, 'STATEMENT_VERSION_CONFLICT', 'A fatura mudou. Recarregue os dados antes de salvar.');
      await tx.statementFactChange.create({ data: { id: decisionId, userId, creditAccountId, statementId, version: (expectedVersion as number) + 1,
        changes: json({ patch: data.facts, previous: previous.facts, current: facts }) } });
      return details(await tx.statement.findFirstOrThrow({ where: { id: statementId, creditAccountId, userId } }));
    });
  }
}
