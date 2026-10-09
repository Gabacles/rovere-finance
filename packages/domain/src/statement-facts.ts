import { parseCivilDate } from './civil-date.js';
import type { CivilDate } from './civil-date.js';
import { parseCents, toMoneyDTO } from './money.js';
import type { MoneyDTO } from './money.js';
import type { KnownValue } from './import-contracts.js';
import type { StatementDTO } from './destinations.js';

export type StatementCycle = 'open' | 'closed';
export interface StatementFacts {
  closingOn: KnownValue<CivilDate>;
  dueOn: KnownValue<CivilDate>;
  declaredTotal: KnownValue<MoneyDTO>;
  cycle: KnownValue<StatementCycle>;
}
export interface StatementDetailsDTO extends StatementDTO { version: number; facts: StatementFacts }
export class StatementFactError extends TypeError {
  constructor(public readonly field: string) { super('Invalid statement fact.'); }
}
export function unknownStatementFacts(): StatementFacts {
  return { closingOn: { state: 'unknown' }, dueOn: { state: 'unknown' }, declaredTotal: { state: 'unknown' }, cycle: { state: 'unknown' } };
}
/** Informational facts only; does not infer payment, overdue state or charge dates. */
export function changeStatementFacts(previous: StatementFacts, patch: unknown, decisionId: string): StatementFacts {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length ||
    Object.keys(patch).some(key => !['closingOn', 'dueOn', 'declaredTotal', 'cycle'].includes(key))) throw new StatementFactError('facts');
  const next = { ...previous };
  const confirmed = <T>(value: T): KnownValue<T> => ({ state: 'confirmed', value, evidence: { kind: 'user', decisionId } });
  for (const [field, value] of Object.entries(patch)) {
    if (value === null) { next[field as keyof StatementFacts] = { state: 'unknown' }; continue; }
    try {
      if (field === 'closingOn' || field === 'dueOn') next[field] = confirmed(parseCivilDate(value as string));
      else if (field === 'cycle') {
        if (value !== 'open' && value !== 'closed') throw new TypeError();
        next.cycle = confirmed(value);
      } else {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError();
        const money = value as Record<string, unknown>;
        if (Object.keys(money).some(key => !['currency', 'cents'].includes(key)) || money.currency !== 'BRL') throw new TypeError();
        next.declaredTotal = confirmed(toMoneyDTO(parseCents(money.cents as string)));
      }
    } catch { throw new StatementFactError(field); }
  }
  return next;
}
