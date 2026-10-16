import { array, bool, commandId, date, enumeration, history, id, integer, magnitude, money, notes, nullable, obj, page, period, recurrenceInput, ref, str, text, version, yes } from './schemas.js';
import type { Schema } from './schemas.js';
const occurrenceInput = obj({ description: text, notes, expectedOn: date, amount: magnitude }, ['description', 'expectedOn', 'amount']);
const actualInput = obj({ description: text, notes, facts: obj({ purchasedOn: date, total: magnitude }) }, ['description', 'facts']);
const operation: Schema = { oneOf: [
  obj({ action: enumeration('generate'), fromPeriod: period, toPeriod: period }),
  obj({ action: enumeration('edit_series'), fromPeriod: period, input: obj({ description: text, notes, amount: magnitude, anchorDay: integer(1, 31), endsOn: nullable(date) }, ['description', 'amount', 'anchorDay', 'endsOn']) }),
  obj({ action: enumeration('pause', 'resume', 'cancel_series') }),
  obj({ action: enumeration('edit_occurrence'), occurrenceId: commandId, input: occurrenceInput }),
  obj({ action: enumeration('cancel_occurrence'), occurrenceId: commandId }),
  obj({ action: enumeration('record'), occurrenceId: commandId, expense: actualInput }),
  obj({ action: enumeration('link'), occurrenceId: commandId, expenseId: commandId, expectedExpenseVersion: version }),
  obj({ action: enumeration('review'), occurrenceId: commandId, expectedExpenseVersion: version }),
] };
const counts = obj({ create: integer(), update: integer(), preserve: integer() });
export const expenseRecurrenceSchemas: Record<string, Schema> = {
  ExpenseRecurrenceInput: obj(recurrenceInput, ['description', 'amount', 'anchorDay', 'startsOn', 'endsOn']),
  ExpenseRecurrence: obj({ id, version: integer(0, 2147483647), cadence: enumeration('monthly'), ...recurrenceInput, evidence: ref('Evidence'), occurrenceCount: integer(), state: enumeration('active', 'paused', 'cancelled'), schedules: array(obj({ ...recurrenceInput, effectiveFrom: period, version: integer(0, 2147483647), evidence: ref('Evidence') })) }),
  ExpenseOccurrence: obj({ id, period, version: integer(0, 2147483647), state: enumeration('planned', 'recorded', 'cancelled'), individual: bool, description: text, notes, expectedOn: date, amount: magnitude,
    original: obj({ expectedOn: date, amount: magnitude, ruleVersion: integer(), evidence: ref('Evidence') }), expense: nullable(ref('Expense')), confirmation: nullable(ref('Expense')), reviewRequired: bool, difference: nullable(money), settlement: enumeration('not_supported') }),
  ExpenseOccurrences: page(ref('ExpenseOccurrence')),
  ExpenseRecurrenceOperation: operation,
  ExpenseRecurrenceConfirmation: obj({ operation: ref('ExpenseRecurrenceOperation'), expectedVersion: version, expectedOccurrenceVersion: version, previewHash: str({ pattern: '^[a-f0-9]{64}$' }), confirmed: yes }, ['operation', 'expectedVersion', 'previewHash', 'confirmed'], { description: 'Ações individuais exigem também expectedOccurrenceVersion; ações de série recusam esse campo. A competência é de planejamento, não de caixa/fatura.' }),
  ExpenseRecurrencePreview: obj({ rule: ref('ExpenseRecurrence'), operation: ref('ExpenseRecurrenceOperation'), asOf: date, rows: array(obj({ period, expectedOn: date, amount: magnitude, disposition: enumeration('create', 'existing', 'outside_rule', 'blocked', 'update', 'past', 'individual', 'cancelled', 'recorded', 'later_schedule'), occurrence: nullable(ref('ExpenseOccurrence')) })), occurrence: nullable(ref('ExpenseOccurrence')), expense: nullable(ref('Expense')), counts, difference: nullable(money), previewHash: str({ pattern: '^[a-f0-9]{64}$' }) }),
  ExpenseRecurrenceResult: obj({ rule: ref('ExpenseRecurrence'), occurrence: nullable(ref('ExpenseOccurrence')), counts }),
  ExpenseRecurrenceHistory: history(true),
};
