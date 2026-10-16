import { describe, expect, it } from 'vitest';
import { assertExpenseOccurrenceAction, expenseAmountDifference, expenseOccurrenceFacts, normalizeExpenseOccurrence, normalizeExpenseRecurrenceOperation } from '../src/expense-recurrences.js';
import { changeExpenseFacts, unknownExpenseFacts } from '../src/expenses.js';
import type { ExpenseDTO } from '../src/expenses.js';
const amount = (cents: string) => ({ currency: 'BRL' as const, cents });
const expense = (total = '11001', purchasedOn = '2027-02-02'): ExpenseDTO => ({ id: 'expense', version: 0, description: 'Assinatura fictícia', notes: null, knowledge: 'complete', facts: changeExpenseFacts(unknownExpenseFacts(), { purchasedOn: purchasedOn as any, total: amount(total) }, 'confirmed'), charges: [] });
describe('RF-031 forecasts and explicitly confirmed economic facts', () => {
  it('requires actual date and total rather than copying the forecast, accepts explicit zero', () => {
    for (const facts of [{}, { purchasedOn: '2027-02-02' }, { total: amount('0') }, { purchasedOn: null, total: amount('0') }]) expect(() => normalizeExpenseRecurrenceOperation({ action: 'record', occurrenceId: 'occurrence', expense: { description: 'Fictícia', facts } })).toThrow();
    expect(normalizeExpenseRecurrenceOperation({ action: 'record', occurrenceId: 'occurrence', expense: { description: ' Fictícia ', facts: { purchasedOn: '2027-02-02', total: amount('0') } } })).toMatchObject({ expense: { description: 'Fictícia', facts: { total: amount('0') } } });
  });
  it('preserves signed differences at monetary limits without float or inferred payment', () => {
    expect(expenseAmountDifference(amount('9223372036854775807'), amount('0'))).toEqual(amount('-9223372036854775807'));
    expect(expenseAmountDifference(amount('0'), amount('9223372036854775807'))).toEqual(amount('9223372036854775807'));
    expect(expenseOccurrenceFacts(amount('10000'), expense(), expense())).toEqual({ difference: amount('1001'), reviewRequired: false });
    expect(expenseOccurrenceFacts(amount('10000'), null, null)).toEqual({ difference: null, reviewRequired: false });
  });
  it('flags actual corrections or cleared facts while retaining prior confirmation', () => {
    const original = expense(); expect(expenseOccurrenceFacts(amount('10000'), expense('9999'), original)).toEqual({ difference: amount('-1'), reviewRequired: true });
    expect(expenseOccurrenceFacts(amount('10000'), expense('11001', '2027-02-03'), original).reviewRequired).toBe(true);
    expect(expenseOccurrenceFacts(amount('10000'), { ...original, facts: unknownExpenseFacts() }, original)).toEqual({ difference: null, reviewRequired: true });
    expect(original.facts.total).toMatchObject({ value: amount('11001') });
  });
  it('makes cancellation terminal and prevents cancelling or recording a linked fact again', () => {
    for (const action of ['record', 'link', 'edit_occurrence', 'cancel_occurrence', 'review'] as const) expect(() => assertExpenseOccurrenceAction('cancelled', action)).toThrow();
    for (const action of ['record', 'link', 'edit_occurrence', 'cancel_occurrence'] as const) expect(() => assertExpenseOccurrenceAction('recorded', action)).toThrow();
    expect(() => assertExpenseOccurrenceAction('recorded', 'review')).not.toThrow(); expect(() => assertExpenseOccurrenceAction('planned', 'review')).toThrow();
  });
  it('keeps planning identity separate from a corrected expected date', () => {
    expect(normalizeExpenseOccurrence({ description: ' Fictícia ', expectedOn: '2028-02-29', amount: amount('1') })).toEqual({ description: 'Fictícia', notes: null, expectedOn: '2028-02-29', amount: amount('1') });
    expect(() => normalizeExpenseOccurrence({ description: 'Fictícia', expectedOn: '2027-02-29', amount: amount('1') })).toThrow();
  });
  it('rejects unbounded commands, unknown fields, unsafe money and unversioned links', () => {
    for (const operation of [{ action: 'generate', fromPeriod: '2020-01', toPeriod: '2030-01' }, { action: 'pause', paid: true }, { action: 'link', occurrenceId: 'a', expenseId: 'b' }, { action: 'review', occurrenceId: 'a', expectedExpenseVersion: -1 }, { action: 'record', occurrenceId: 'a', expense: { description: 'Fictícia', facts: { purchasedOn: '2027-02-02', total: { currency: 'BRL', cents: 1.1 } } } }]) expect(() => normalizeExpenseRecurrenceOperation(operation)).toThrow();
  });
});
