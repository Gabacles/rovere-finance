import { parseCivilDate } from './civil-date.js';
import type { CivilDate } from './civil-date.js';
import { parseCents, toMoneyDTO } from './money.js';
import type { MoneyDTO } from './money.js';
import type { KnownValue } from './import-contracts.js';

export interface ExpenseFacts { purchasedOn: KnownValue<CivilDate>; total: KnownValue<MoneyDTO> }
export interface ExpenseChargeDTO {
  id: string; creditAccountId: string; statementId: string; postedOn: string; description: string;
  amount: MoneyDTO; installment: unknown; notes: string | null;
}
export interface ExpenseDTO {
  id: string; version: number; description: string; notes: string | null; facts: ExpenseFacts;
  knowledge: 'partial' | 'complete'; charges: ExpenseChargeDTO[];
}
export interface ExpensePatch {
  description?: string; notes?: string | null;
  facts?: { purchasedOn?: CivilDate | null; total?: MoneyDTO | null };
  association?: { action: 'link' | 'unlink'; chargeId: string };
}
export class ExpenseError extends TypeError {
  constructor(public readonly field: string) { super('Invalid expense data.'); }
}
function object(value: unknown, fields: string[], field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw new ExpenseError(field);
  return value as Record<string, unknown>;
}
/** Canonical input, independent of HTTP, persistence and financial sign conventions. */
export function normalizeExpensePatch(value: unknown, creating = false): ExpensePatch {
  const data = object(value, creating ? ['description', 'notes', 'facts'] : ['description', 'notes', 'facts', 'association'], 'expense');
  const next: ExpensePatch = {};
  if (creating || 'description' in data) {
    if (typeof data.description !== 'string' || !data.description.trim() || data.description.trim().length > 500) throw new ExpenseError('description');
    next.description = data.description.trim();
  }
  if ('notes' in data) {
    if (data.notes !== null && (typeof data.notes !== 'string' || data.notes.length > 1000)) throw new ExpenseError('notes');
    next.notes = data.notes === null ? null : (data.notes as string).trim() || null;
  } else if (creating) next.notes = null;
  if ('facts' in data) {
    const facts = object(data.facts, ['purchasedOn', 'total'], 'facts'); next.facts = {};
    if ('purchasedOn' in facts) {
      try { next.facts.purchasedOn = facts.purchasedOn === null ? null : parseCivilDate(facts.purchasedOn as string); }
      catch { throw new ExpenseError('purchasedOn'); }
    }
    if ('total' in facts) {
      if (facts.total === null) next.facts.total = null;
      else {
        try {
          const money = object(facts.total, ['currency', 'cents'], 'total'); const cents = parseCents(money.cents as string);
          if (money.currency !== 'BRL' || cents < 0n) throw new TypeError();
          next.facts.total = toMoneyDTO(cents);
        } catch { throw new ExpenseError('total'); }
      }
    }
    if (!Object.keys(next.facts).length) delete next.facts;
  }
  if ('association' in data) {
    const association = object(data.association, ['action', 'chargeId'], 'association');
    if (!['link', 'unlink'].includes(association.action as string) || typeof association.chargeId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(association.chargeId)) throw new ExpenseError('association');
    next.association = { action: association.action as 'link' | 'unlink', chargeId: association.chargeId };
  }
  if (!Object.keys(next).length) throw new ExpenseError('expense');
  return next;
}
export function unknownExpenseFacts(): ExpenseFacts { return { purchasedOn: { state: 'unknown' }, total: { state: 'unknown' } }; }
export function changeExpenseFacts(previous: ExpenseFacts, patch: ExpensePatch['facts'], decisionId: string): ExpenseFacts {
  const next = { ...previous };
  const confirmed = <T>(value: T): KnownValue<T> => ({ state: 'confirmed', value, evidence: { kind: 'user', decisionId } });
  if (patch?.purchasedOn !== undefined) next.purchasedOn = patch.purchasedOn === null ? { state: 'unknown' } : confirmed(patch.purchasedOn);
  if (patch?.total !== undefined) next.total = patch.total === null ? { state: 'unknown' } : confirmed(patch.total);
  return next;
}
export function expenseKnowledge(facts: ExpenseFacts): ExpenseDTO['knowledge'] {
  return facts.purchasedOn.state === 'confirmed' && facts.total.state === 'confirmed' ? 'complete' : 'partial';
}
