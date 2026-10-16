import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { ImportWorker } from '../src/imports/worker.js';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { mailLink } from '../../../scripts/test-mail.mjs';
import { contractValidator } from './openapi-validator.js';
const origin = 'http://127.0.0.1:18080'; const route = (id: string) => `/expense-recurrences/${id}`; const money = (cents: string) => ({ currency: 'BRL', cents });
let database: Awaited<ReturnType<typeof testDatabase>>; let db: ReturnType<typeof createDatabase>; let app: Awaited<ReturnType<typeof createApp>>; let base: string; let document: any;
let alice: { id: string; cookie: string }; let bob: typeof alice;
const config = () => ({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: origin, smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false, importsWorkerEnabled: false });
function request(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', cookie = alice?.cookie ?? '', headers = {}) { return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' }); }
async function register(name: string) { const email = `${name}-${randomUUID()}@rovere.test`; const password = 'Fictitious-expense-recurrence-123!'; const signup = await request('/auth/sign-up/email', { name, email, password }); expect(signup.status).toBe(200); const user = (await signup.json()).user; const link = new URL(await mailLink(email, 'Confirme')); await fetch(`${base}${link.pathname}${link.search}`, { redirect: 'manual' }); const login = await request('/auth/sign-in/email', { email, password }); expect(login.status).toBe(200); return { id: user.id, cookie: login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') }; }
function valid(name: string, value: any) { const validate = contractValidator(document, { $ref: `#/components/schemas/${name}` }); expect(validate(value), JSON.stringify(validate.errors)).toBe(true); }
const input = { description: 'Assinatura fictícia', amount: money('10000'), anchorDay: 31, startsOn: '2024-01-01', endsOn: null };
async function rule(patch = {}) { const response = await request('/expense-recurrences', { ...input, ...patch }); expect(response.status).toBe(201); const value = await response.json(); valid('ExpenseRecurrence', value); return value; }
async function preview(id: string, operation: unknown) { const response = await request(`${route(id)}/preview`, operation); const value = await response.json(); expect(response.status, JSON.stringify(value)).toBe(201); valid('ExpenseRecurrencePreview', value); return { value, body: { operation: value.operation, expectedVersion: value.rule.version, ...(value.occurrence ? { expectedOccurrenceVersion: value.occurrence.version } : {}), previewHash: value.previewHash, confirmed: true } }; }
async function change(id: string, operation: unknown) { const p = await preview(id, operation); const response = await request(`${route(id)}/confirm`, p.body); const value = await response.json(); expect(response.status, JSON.stringify(value)).toBe(201); valid('ExpenseRecurrenceResult', value); return value; }
const gen = (fromPeriod = '2090-01', toPeriod = '2090-03') => ({ action: 'generate', fromPeriod, toPeriod });
const edit = (fromPeriod = '2090-01', cents = '20000', anchorDay = 15) => ({ action: 'edit_series', fromPeriod, input: { description: 'Programação corrigida', amount: money(cents), anchorDay, endsOn: null } });
const record = (occurrenceId: string, cents = '11001') => ({ action: 'record', occurrenceId, expense: { description: 'Fato econômico confirmado', facts: { purchasedOn: '2089-12-28', total: money(cents) } } });
async function rows(id: string, page = 1) { const result = await (await request(`${route(id)}/occurrences?page=${page}`)).json(); valid('ExpenseOccurrences', result); return result; }
async function prepare(patch = {}) { const value = await rule(patch); await change(value.id, gen()); return { rule: value, rows: (await rows(value.id)).rows }; }
async function purchase(cents = '9900') { const response = await request('/expenses', { description: 'Despesa existente fictícia', facts: { purchasedOn: '2089-12-29', total: money(cents) } }); expect(response.status).toBe(201); return response.json(); }
beforeAll(async () => { database = await testDatabase(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); alice = await register('RecurringExpenseAlice'); bob = await register('RecurringExpenseBob'); document = JSON.parse(await readFile('docs/api/openapi.json', 'utf8')); });
afterAll(async () => { await app?.close(); await database?.close(); });

describe('RF-031 explicit recurring expenses', () => {
  it('generates only forecasts with original anchors, finite inclusive periods and no synthetic financial records', async () => {
    const value = await rule({ startsOn: '2024-02-29', endsOn: '2024-03-31', amount: money('9223372036854775807') });
    const counts = { expense: await db.expense.count(), bank: await db.bankEntry.count(), charge: await db.cardCharge.count(), statement: await db.statement.count() };
    const p = await preview(value.id, gen('2024-01', '2024-04')); expect(p.value.rows.map((row: any) => [row.expectedOn, row.disposition])).toEqual([['2024-01-31', 'outside_rule'], ['2024-02-29', 'create'], ['2024-03-31', 'create'], ['2024-04-30', 'outside_rule']]);
    expect(await db.expenseOccurrence.count({ where: { ruleId: value.id } })).toBe(0); await change(value.id, gen('2024-01', '2024-04'));
    expect((await rows(value.id)).rows).toHaveLength(2); expect((await rows(value.id)).rows[0]).toMatchObject({ period: '2024-02', amount: money('9223372036854775807'), state: 'planned', expense: null, confirmation: null, difference: null, settlement: 'not_supported' });
    expect({ expense: await db.expense.count(), bank: await db.bankEntry.count(), charge: await db.cardCharge.count(), statement: await db.statement.count() }).toEqual(counts);
  });
  it('explicitly records divergent facts without a card or payment, preserves the planning period and exact zero', async () => {
    const value = await prepare(); const first = value.rows[0]; const count = await db.expense.count(); const p = await preview(value.rule.id, record(first.id)); expect(p.value.difference).toEqual(money('1001')); expect(await db.expense.count()).toBe(count);
    const result = await change(value.rule.id, record(first.id)); expect(result.occurrence).toMatchObject({ period: '2090-01', state: 'recorded', expectedOn: '2090-01-31', amount: money('10000'), difference: money('1001'), reviewRequired: false, expense: { facts: { purchasedOn: { value: '2089-12-28' }, total: { value: money('11001') } }, charges: [] } });
    expect(await db.expense.count()).toBe(count + 1); expect(await db.bankEntry.count()).toBe(0); expect(await db.cardCharge.count()).toBe(0);
    const zero = await change(value.rule.id, record(value.rows[1].id, '0')); expect(zero.occurrence.difference).toEqual(money('-10000')); expect(zero.occurrence.settlement).toBe('not_supported');
    for (const operation of [record(first.id), { action: 'cancel_occurrence', occurrenceId: first.id }, { action: 'edit_occurrence', occurrenceId: first.id, input: { description: 'Invalid change', expectedOn: '2090-01-30', amount: money('1') } }]) expect((await request(`${route(value.rule.id)}/preview`, operation)).status).toBe(409);
  });
  it('links a unique existing expense, rejects incomplete facts and atomically serializes competing occurrences', async () => {
    const a = await prepare(); const b = await prepare(); const expense = await purchase(); const count = await db.expense.count();
    const op = (id: string) => ({ action: 'link', occurrenceId: id, expenseId: expense.id, expectedExpenseVersion: expense.version });
    const pa = await preview(a.rule.id, op(a.rows[0].id)); const pb = await preview(b.rule.id, op(b.rows[0].id));
    const responses = await Promise.all([request(`${route(a.rule.id)}/confirm`, pa.body), request(`${route(b.rule.id)}/confirm`, pb.body)]); expect(responses.map(row => row.status).sort()).toEqual([201, 409]);
    expect(await db.expenseOccurrence.count({ where: { expenseId: expense.id } })).toBe(1); expect(await db.expense.count()).toBe(count);
    const current = await (await request(`/expenses/${expense.id}`)).json(); expect(current.version).toBe(1); expect(current.facts).toEqual(expense.facts); const history = await (await request(`/expenses/${expense.id}/history`)).json(); expect(history[0].changes.action).toBe('confirm_recurrence');
    const partial = await (await request('/expenses', { description: 'Sem fatos conhecidos' })).json(); expect((await request(`${route(a.rule.id)}/preview`, { ...op(a.rows[1].id), expenseId: partial.id, expectedExpenseVersion: 0 })).status).toBe(409);
    expect((await request(`${route(a.rule.id)}/preview`, { ...op(a.rows[1].id), expectedExpenseVersion: current.version })).status).toBe(409);
  });
  it('flags later manual corrections, invalidates stale previews and explicitly reviews without overwriting facts or creating another expense', async () => {
    const value = await prepare(); const recorded = await change(value.rule.id, record(value.rows[0].id)); const expense = recorded.occurrence.expense; const snapshot = recorded.occurrence.confirmation;
    const p = await preview(value.rule.id, { action: 'review', occurrenceId: value.rows[0].id, expectedExpenseVersion: expense.version });
    expect((await request(`/expenses/${expense.id}`, { expectedVersion: expense.version, facts: { purchasedOn: '2090-02-03', total: money('9000') } }, 'PATCH')).status).toBe(200);
    expect((await request(`${route(value.rule.id)}/confirm`, p.body)).status).toBe(409); const current = (await rows(value.rule.id)).rows[0]; expect(current).toMatchObject({ reviewRequired: true, difference: money('-1000'), confirmation: snapshot, expense: { facts: { total: { value: money('9000') } } } });
    const count = await db.expense.count(); const reviewed = await change(value.rule.id, { action: 'review', occurrenceId: current.id, expectedExpenseVersion: current.expense.version }); expect(reviewed.occurrence.reviewRequired).toBe(false); expect(reviewed.occurrence.confirmation.facts.total.value).toEqual(money('9000')); expect(await db.expense.count()).toBe(count);
    const journal = await (await request(`${route(value.rule.id)}/history`)).json(); expect(journal[0].changes.previous.occurrence.confirmation).toEqual(snapshot);
    expect((await request(`/expenses/${expense.id}`, { expectedVersion: current.expense.version, facts: { total: null } }, 'PATCH')).status).toBe(200); const cleared = (await rows(value.rule.id)).rows[0]; expect(cleared).toMatchObject({ reviewRequired: true, difference: null, expense: { facts: { total: { state: 'unknown' } } } }); expect((await request(`${route(value.rule.id)}/preview`, { action: 'review', occurrenceId: current.id, expectedExpenseVersion: cleared.expense.version })).status).toBe(409);
  });
  it('reuses lifecycle protections for future edits, exceptions, pauses and terminal cancellations', async () => {
    const value = await prepare(); await change(value.rule.id, gen('2024-01', '2024-01'));
    await change(value.rule.id, { action: 'edit_occurrence', occurrenceId: value.rows[0].id, input: { description: 'Individual', expectedOn: '2090-01-28', amount: money('15000') } }); await change(value.rule.id, record(value.rows[1].id));
    const p = await preview(value.rule.id, edit()); expect(p.value.rows.map((row: any) => row.disposition)).toEqual(['past', 'individual', 'recorded', 'update']); await change(value.rule.id, edit());
    const current = (await rows(value.rule.id)).rows; expect(current.find((row: any) => row.id === value.rows[2].id)).toMatchObject({ expectedOn: '2090-03-15', amount: money('20000'), original: { expectedOn: '2090-03-31', amount: money('10000') } });
    await change(value.rule.id, { action: 'pause' }); const paused = await preview(value.rule.id, gen('2090-04', '2090-04')); expect(paused.value.rows[0].disposition).toBe('blocked'); expect((await request(`${route(value.rule.id)}/confirm`, paused.body)).status).toBe(409);
    await change(value.rule.id, { action: 'resume' }); expect((await rows(value.rule.id)).total).toBe(4);
    await change(value.rule.id, { action: 'cancel_occurrence', occurrenceId: value.rows[2].id }); await change(value.rule.id, gen()); expect((await rows(value.rule.id)).total).toBe(4);
    await change(value.rule.id, { action: 'cancel_series' }); expect((await request(`${route(value.rule.id)}/preview`, { action: 'resume' })).status).toBe(409); expect((await rows(value.rule.id)).rows.find((row: any) => row.id === value.rows[1].id).expense).not.toBeNull();
    await change(value.rule.id, { action: 'cancel_occurrence', occurrenceId: value.rows[0].id });
  });
  it('preserves later scheduled revisions and historical descriptions during subsequent generation', async () => {
    const value = await rule(); await change(value.id, edit('2090-04', '30000', 30)); await change(value.id, edit('2090-02', '20000', 15)); await change(value.id, gen('2090-01', '2090-04'));
    expect((await rows(value.id)).rows.map((row: any) => [row.expectedOn, row.amount.cents, row.description])).toEqual([['2090-01-31', '10000', input.description], ['2090-02-15', '20000', 'Programação corrigida'], ['2090-03-15', '20000', 'Programação corrigida'], ['2090-04-30', '30000', 'Programação corrigida']]);
    const p = await preview(value.id, edit('2090-01', '25000', 28)); expect(p.value.rows.map((row: any) => row.disposition)).toEqual(['update', 'later_schedule', 'later_schedule', 'later_schedule']);
  });
  it('replays lost responses and concurrent identical commands after restart and rejects other payloads or obsolete versions', async () => {
    const headers = { 'Idempotency-Key': randomUUID() }; const created = await request('/expense-recurrences', input, 'POST', alice.cookie, headers); const value = await created.json(); expect(created.status).toBe(201); expect(await (await request('/expense-recurrences', input, 'POST', alice.cookie, headers)).json()).toEqual(value);
    await change(value.id, gen()); const occurrence = (await rows(value.id)).rows[0]; const p = await preview(value.id, record(occurrence.id)); const token = { 'Idempotency-Key': randomUUID() };
    const results = await Promise.all([request(`${route(value.id)}/confirm`, p.body, 'POST', alice.cookie, token), request(`${route(value.id)}/confirm`, p.body, 'POST', alice.cookie, token)]); expect(results.map(row => row.status)).toEqual([201, 201]); const first = await results[0]!.json(); expect(await results[1]!.json()).toEqual(first);
    const pause = await preview(value.id, { action: 'pause' }); const cancel = await preview(value.id, { action: 'cancel_series' }); const race = await Promise.all([request(`${route(value.id)}/confirm`, pause.body), request(`${route(value.id)}/confirm`, cancel.body)]); expect(race.map(row => row.status).sort()).toEqual([201, 409]);
    await app.close(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
    expect(await (await request(`${route(value.id)}/confirm`, p.body, 'POST', alice.cookie, token)).json()).toEqual(first); expect((await request(`${route(value.id)}/confirm`, { ...p.body, previewHash: '0'.repeat(64) }, 'POST', alice.cookie, token)).status).toBe(409);
    expect(await (await request('/expense-recurrences', input, 'POST', alice.cookie, headers)).json()).toEqual(value); expect((await request(`${route(value.id)}/confirm`, p.body)).status).toBe(409);
  });
  it('rolls back expense, link, occurrence, version and both journals on injected persistence failures', async () => {
    const value = await prepare(); const p = await preview(value.rule.id, record(value.rows[0].id)); const original = await (await request(route(value.rule.id))).json(); const count = await db.expense.count();
    for (const table of ['ExpenseCommand', 'ExpenseRecurrenceCommand']) {
      await db.$executeRawUnsafe(`CREATE FUNCTION reject_rf031_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictitious journal failure'; END; $$`); await db.$executeRawUnsafe(`CREATE TRIGGER test_rf031_failure BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION reject_rf031_journal()`);
      try { expect((await request(`${route(value.rule.id)}/confirm`, p.body)).status).toBe(500); } finally { await db.$executeRawUnsafe(`DROP TRIGGER test_rf031_failure ON "${table}"`); await db.$executeRawUnsafe('DROP FUNCTION reject_rf031_journal()'); }
      expect(await db.expense.count()).toBe(count); expect(await (await request(route(value.rule.id))).json()).toEqual(original); expect((await rows(value.rule.id)).rows[0].state).toBe('planned');
    }
  });
  it('isolates all endpoints, typed links and immutable evidence and rejects malformed JSON/money/confirmation', async () => {
    const value = await prepare(); const p = await preview(value.rule.id, record(value.rows[0].id));
    for (const [suffix, body] of [['', undefined], ['/history', undefined], ['/occurrences', undefined], ['/preview', p.body.operation], ['/confirm', p.body]] as const) { for (const [cookie, status] of [[bob.cookie, 404], ['', 401]] as const) expect((await request(`${route(value.rule.id)}${suffix}`, body, body ? 'POST' : 'GET', cookie)).status).toBe(status); }
    const other = await db.expense.create({ data: { userId: bob.id, description: 'Privada' } }); expect((await request(`${route(value.rule.id)}/preview`, { action: 'link', occurrenceId: value.rows[0].id, expenseId: other.id, expectedExpenseVersion: 0 })).status).toBe(404);
    const row = await db.expenseOccurrence.findUniqueOrThrow({ where: { id: value.rows[0].id } }); await expect(db.expenseOccurrence.update({ where: { id: row.id }, data: { originalCents: 0n, version: 1 } })).rejects.toThrow(); await expect(db.expenseOccurrence.delete({ where: { id: row.id } })).rejects.toThrow(); await expect(db.expenseOccurrence.create({ data: { ...row, id: randomUUID(), period: '2090-04', userId: bob.id } })).rejects.toThrow();
    await expect(db.expenseOccurrence.update({ where: { id: row.id }, data: { state: 'recorded', expenseId: other.id, confirmation: { id: other.id }, version: 1 } })).rejects.toThrow();
    const command = await db.expenseRecurrenceCommand.findFirstOrThrow({ where: { ruleId: value.rule.id } }); await expect(db.expenseRecurrenceCommand.update({ where: { id: command.id }, data: { result: {} } })).rejects.toThrow(); await expect(db.expenseRecurrenceCommand.delete({ where: { id: command.id } })).rejects.toThrow();
    for (const patch of [{ amount: money('-1') }, { amount: money('9223372036854775808') }, { amount: { currency: 'BRL', cents: 1.1 } }, { anchorDay: 32 }, { endsOn: undefined }, { paid: true }]) expect((await request('/expense-recurrences', { ...input, ...patch })).status).toBe(400);
    expect((await request(`${route(value.rule.id)}/confirm`, { ...p.body, confirmed: false })).status).toBe(400); expect((await request(`${route(value.rule.id)}/confirm`, p.body, 'POST', alice.cookie, { Origin: 'https://other.test' })).status).toBe(403); expect((await request('/expense-recurrences', input, 'POST', alice.cookie, { 'Idempotency-Key': '' })).status).toBe(400);
    for (const [body, status] of [['{"private":"fictitious-private-value"', 400], [JSON.stringify({ private: 'fictitious-private-value'.repeat(1000) }), 413]] as const) { const response = await fetch(`${base}/api/expense-recurrences`, { method: 'POST', headers: { Origin: origin, Cookie: alice.cookie, 'Content-Type': 'application/json' }, body }); expect(response.status).toBe(status); expect(JSON.stringify(await response.json())).not.toContain('fictitious-private-value'); }
  });
  it('generates and edits 120 months atomically, paginates and retains a complete journal beyond 20 HTTP entries', async () => {
    const value = await rule({ amount: money('0') }); const started = performance.now(); await change(value.id, gen('2090-01', '2099-12')); await change(value.id, edit('2090-01', '9223372036854775807', 30)); console.info(`RF-031 120-month generation+future edit: ${Math.round(performance.now() - started)}ms`);
    expect((await rows(value.id)).rows).toHaveLength(25); expect((await rows(value.id, 5)).rows).toHaveLength(20); expect(await db.expenseOccurrence.count({ where: { ruleId: value.id, cents: 9223372036854775807n } })).toBe(120);
    for (let index = 0; index < 20; index++) await change(value.id, gen('2090-01', '2090-01')); const journal = await (await request(`${route(value.id)}/history`)).json(); valid('ExpenseRecurrenceHistory', journal); expect(journal).toHaveLength(20); expect(await db.expenseRecurrenceCommand.count({ where: { ruleId: value.id } })).toBe(23);
  });
  it.each(['csv', 'ofx'])('preserves imported %s charges, manual corrections and occurrence identity after reimport', async format => {
    const credit = await (await request('/credit-accounts', { name: `Crédito fictício ${format}` })).json(); const statement = await (await request(`/credit-accounts/${credit.id}/statements`, { period: '2026-10' })).json();
    const template = await readFile('packages/importers/test/fixtures/card-220.ofx', 'utf8'); const first = template.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/)![0]; const text = format === 'ofx' ? template.replace(/<STMTTRN>[\s\S]*<\/STMTTRN>/, first) : 'Date;Description;Amount;ID\n2026-10-08;Assinatura importada fictícia;-100.00;rf031-import';
    async function imported() {
      const form = new FormData(); form.append('format', format); form.append('configuration', JSON.stringify(format === 'ofx' ? {} : { profile: { id: 'rf031-csv', encoding: 'utf-8', delimiter: ';', headerLine: 1, dateFormat: 'YMD', decimal: '.', grouping: null, sign: 'as-is', currency: 'BRL', kind: 'card', columns: { date: 'Date', description: 'Description', amount: 'Amount', externalId: 'ID' } } })); form.append('file', new Blob([text]), `fictitious.${format}`);
      const upload = await fetch(`${base}/api/imports`, { method: 'POST', headers: { Origin: origin, Cookie: alice.cookie, 'Idempotency-Key': randomUUID() }, body: form }); expect(upload.status).toBe(201); const batch = await upload.json(); await app.get(ImportWorker).runOnce(); const current = await (await request(`/imports/${batch.id}`)).json(); expect(current.status).toBe('review');
      const savedResponse = await request(`/imports/${batch.id}/review`, { expectedVersion: current.version, blocks: current.blocks.map((block: any) => ({ id: block.id, creditAccountId: credit.id, statementId: statement.id })) }, 'PATCH'); expect(savedResponse.status).toBe(200); const saved = await savedResponse.json(); const result = await request(`/imports/${batch.id}/confirm`, { expectedVersion: saved.version }); expect(result.status).toBe(201); return result.json();
    }
    const initial = await imported(); expect(initial.created).toBe(1); const charge = await db.cardCharge.findFirstOrThrow({ where: { creditAccountId: credit.id } });
    const expense = await purchase(); const linked = await request(`/expenses/${expense.id}`, { expectedVersion: expense.version, description: 'Correção manual preservada', association: { action: 'link', chargeId: charge.id } }, 'PATCH'); expect(linked.status).toBe(200); const corrected = await linked.json();
    const value = await prepare(); const confirmed = await change(value.rule.id, { action: 'link', occurrenceId: value.rows[0].id, expenseId: expense.id, expectedExpenseVersion: corrected.version }); const before = (await rows(value.rule.id)).rows[0]; expect(before.expense.charges).toHaveLength(1); expect(before.difference).toEqual(money('-100'));
    expect(await imported()).toMatchObject({ created: 0, linked: 1 }); expect(await db.cardCharge.findUniqueOrThrow({ where: { id: charge.id } })).toEqual(charge); const after = (await rows(value.rule.id)).rows[0]; expect(after).toEqual(before); expect(after.expense.description).toBe('Correção manual preservada'); expect(after.expense.id).toBe(confirmed.occurrence.expense.id); expect(await db.cardCharge.count({ where: { creditAccountId: credit.id } })).toBe(1); expect(await db.importOutcome.count({ where: { chargeId: charge.id } })).toBe(2);
  });
});
