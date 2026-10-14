import { parseCivilDate } from './civil-date.js';
import type { CivilDate } from './civil-date.js';
import { parseCents, toMoneyDTO } from './money.js';
import type { MoneyDTO } from './money.js';
import type { KnownValue } from './import-contracts.js';

export interface IncomeFacts { expectedOn: KnownValue<CivilDate>; expectedAmount: KnownValue<MoneyDTO> }
export interface IncomeDTO {
  id: string; version: number; description: string; notes: string | null;
  state: 'planned' | 'cancelled'; origin: { kind: 'manual'; decisionId: string };
  facts: IncomeFacts; knowledge: 'partial' | 'complete';
}
export interface IncomePatch { description?: string; notes?: string | null; facts?: { expectedOn?: CivilDate | null; expectedAmount?: MoneyDTO | null } }
export class IncomeError extends TypeError {
  constructor(public readonly field: string) { super('Invalid planned income.'); }
}
function object(value: unknown, fields: string[], field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw new IncomeError(field);
  return value as Record<string, unknown>;
}
export function normalizeIncomePatch(value: unknown, creating = false): IncomePatch {
  const data = object(value, ['description', 'notes', 'facts'], 'income'); const next: IncomePatch = {};
  if (creating || 'description' in data) {
    if (typeof data.description !== 'string' || !data.description.trim() || data.description.trim().length > 500) throw new IncomeError('description');
    next.description = data.description.trim();
  }
  if ('notes' in data) {
    if (data.notes !== null && (typeof data.notes !== 'string' || data.notes.length > 1000)) throw new IncomeError('notes');
    next.notes = data.notes === null ? null : (data.notes as string).trim() || null;
  } else if (creating) next.notes = null;
  if ('facts' in data) {
    const facts = object(data.facts, ['expectedOn', 'expectedAmount'], 'facts'); next.facts = {};
    if ('expectedOn' in facts) {
      try { next.facts.expectedOn = facts.expectedOn === null ? null : parseCivilDate(facts.expectedOn as string); }
      catch { throw new IncomeError('expectedOn'); }
    }
    if ('expectedAmount' in facts) {
      if (facts.expectedAmount === null) next.facts.expectedAmount = null;
      else {
        try {
          const money = object(facts.expectedAmount, ['currency', 'cents'], 'expectedAmount'); const cents = parseCents(money.cents as string);
          if (money.currency !== 'BRL' || cents < 0n) throw new TypeError();
          next.facts.expectedAmount = toMoneyDTO(cents);
        } catch { throw new IncomeError('expectedAmount'); }
      }
    }
    if (!Object.keys(next.facts).length) delete next.facts;
  }
  if (!Object.keys(next).length) throw new IncomeError('income');
  return next;
}
export function unknownIncomeFacts(): IncomeFacts { return { expectedOn: { state: 'unknown' }, expectedAmount: { state: 'unknown' } }; }
export function changeIncomeFacts(previous: IncomeFacts, patch: IncomePatch['facts'], decisionId: string): IncomeFacts {
  const next = { ...previous };
  const confirmed = <T>(value: T): KnownValue<T> => ({ state: 'confirmed', value, evidence: { kind: 'user', decisionId } });
  if (patch?.expectedOn !== undefined) next.expectedOn = patch.expectedOn === null ? { state: 'unknown' } : confirmed(patch.expectedOn);
  if (patch?.expectedAmount !== undefined) next.expectedAmount = patch.expectedAmount === null ? { state: 'unknown' } : confirmed(patch.expectedAmount);
  return next;
}
export function incomeKnowledge(facts: IncomeFacts): IncomeDTO['knowledge'] {
  return facts.expectedOn.state === 'confirmed' && facts.expectedAmount.state === 'confirmed' ? 'complete' : 'partial';
}
/** Cancellation is terminal; replay belongs to the application journal, not this transition. */
export function incomeTransition(state: IncomeDTO['state'], action: 'edit' | 'cancel'): IncomeDTO['state'] {
  if (state !== 'planned') throw new IncomeError('state');
  return action === 'cancel' ? 'cancelled' : 'planned';
}
