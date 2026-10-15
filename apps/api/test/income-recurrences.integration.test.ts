import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { mailLink } from '../../../scripts/test-mail.mjs';
import { contractValidator } from './openapi-validator.js';
const origin = 'http://127.0.0.1:18080';
let database: Awaited<ReturnType<typeof testDatabase>>; let db: ReturnType<typeof createDatabase>; let app: Awaited<ReturnType<typeof createApp>>; let base: string;
let alice: { id: string; cookie: string }; let bob: typeof alice; let document: any;
const config = () => ({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: origin, smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false, importsWorkerEnabled: false });
function request(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', cookie = alice?.cookie ?? '', extra = {}) {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
}
async function register(name: string) {
  const email = `${name}-${randomUUID()}@rovere.test`; const password = 'Fictitious-recurrence-123!';
  const signup = await request('/auth/sign-up/email', { name, email, password }); expect(signup.status).toBe(200); const user = (await signup.json()).user;
  const url = new URL(await mailLink(email, 'Confirme')); await fetch(`${base}${url.pathname}${url.search}`, { redirect: 'manual' });
  const login = await request('/auth/sign-in/email', { email, password }); expect(login.status).toBe(200);
  return { id: user.id, cookie: login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
const input = { description: 'Salário mensal fictício', amount: { currency: 'BRL', cents: '9223372036854775807' }, anchorDay: 31, startsOn: '0001-01-01', endsOn: null };
const range = { fromPeriod: '2024-01', toPeriod: '2024-03' };
function valid(schema: string, data: any) { const validate = contractValidator(document, { $ref: `#/components/schemas/${schema}` }); expect(validate(data), JSON.stringify(validate.errors)).toBe(true); }
async function rule(patch = {}) { const response = await request('/income-recurrences', { ...input, ...patch }); expect(response.status).toBe(201); const value = await response.json(); valid('IncomeRecurrence', value); return value; }
async function preview(id: string, interval = range) { const response = await request(`/income-recurrences/${id}/preview`, interval); expect(response.status).toBe(201); const value = await response.json(); valid('IncomeGenerationPreview', value); return value; }
const generation = (value: any) => ({ ...value.range, expectedVersion: value.rule.version, previewHash: value.previewHash, generationConfirmed: true });
async function generate(id: string, interval = range) { const value = await preview(id, interval); const response = await request(`/income-recurrences/${id}/generate`, generation(value)); expect(response.status).toBe(201); const result = await response.json(); valid('IncomeGenerationResult', result); return result; }
beforeAll(async () => { database = await testDatabase(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); alice = await register('RecurrenceAlice'); bob = await register('RecurrenceBob'); document = JSON.parse(await readFile('docs/api/openapi.json', 'utf8')); });
afterAll(async () => { await app?.close(); await database?.close(); });

describe('RF-029 confirmed income recurrences', () => {
  it('creates only a rule and previews inclusive dates without any financial writes', async () => {
    const before = await db.income.count(); const value = await rule({ startsOn: '2024-02-29', endsOn: '2024-03-31' });
    expect(value).toMatchObject({ version: 0, occurrenceCount: 0, evidence: { kind: 'user' } });
    const simulated = await preview(value.id); expect(simulated.rows.map((row: any) => [row.expectedOn, row.state])).toEqual([['2024-01-31', 'outside_rule'], ['2024-02-29', 'create'], ['2024-03-31', 'create']]);
    expect(await db.income.count()).toBe(before); expect(await db.recurrenceCommand.count({ where: { ruleId: value.id } })).toBe(1);
    const result = await generate(value.id); expect(result.created).toHaveLength(2); expect(result.rule).toMatchObject({ version: 1, occurrenceCount: 2, anchorDay: 31 });
    for (const created of result.created) { const income = await (await request(`/incomes/${created.incomeId}`)).json(); valid('Income', income); expect(income.origin).toMatchObject({ kind: 'recurrence', ruleId: value.id, occurrenceId: created.occurrenceId }); expect(income.facts.expectedAmount.value.cents).toBe(input.amount.cents); expect(income.facts.expectedOn.evidence.decisionId).toBe(income.origin.decisionId); const history = await (await request(`/incomes/${created.incomeId}/history`)).json(); valid('IncomeHistory', history); expect(history[0].changes.action).toBe('generate'); }
    expect(await db.bankEntry.count()).toBe(0); expect(await db.cardCharge.count()).toBe(0); expect(await db.expense.count()).toBe(0); expect(await db.statement.count()).toBe(0); expect(await db.incomeSettlement.count()).toBe(0);
  });
  it('keeps two rules on the same February date separate and preserves original anchors after February', async () => {
    const a = await rule({ anchorDay: 30 }); const b = await rule({ anchorDay: 31 });
    for (const item of [a, b]) { const result = await generate(item.id, { fromPeriod: '2025-02', toPeriod: '2025-03' }); const occurrences = await db.scheduledOccurrence.findMany({ where: { ruleId: item.id }, orderBy: { period: 'asc' } }); expect(result.created).toHaveLength(2); expect(occurrences.map(row => row.expectedOn.toISOString().slice(0, 10))).toEqual(['2025-02-28', `2025-03-${item.anchorDay}`]); }
  });
  it('replays concurrent identical commands after restart and deduplicates overlapping ranges/new keys', async () => {
    const headers = { 'Idempotency-Key': randomUUID() }; const responses = await Promise.all([request('/income-recurrences', input, 'POST', alice.cookie, headers), request('/income-recurrences', input, 'POST', alice.cookie, headers)]);
    expect(responses.map(row => row.status)).toEqual([201, 201]); const value = await responses[0]!.json(); expect(await responses[1]!.json()).toEqual(value);
    const p = await preview(value.id); const body = generation(p); const genHeaders = { 'Idempotency-Key': randomUUID() };
    const concurrent = await Promise.all([request(`/income-recurrences/${value.id}/generate`, body, 'POST', alice.cookie, genHeaders), request(`/income-recurrences/${value.id}/generate`, body, 'POST', alice.cookie, genHeaders)]);
    expect(concurrent.map(row => row.status)).toEqual([201, 201]); const first = await concurrent[0]!.json(); expect(await concurrent[1]!.json()).toEqual(first);
    const overlap = await generate(value.id, { fromPeriod: '2024-02', toPeriod: '2024-04' }); expect(overlap.created).toHaveLength(1); expect(overlap.preview.counts.existing).toBe(3);
    const noop = await generate(value.id); expect(noop.created).toEqual([]); expect(noop.rule.version).toBe(3);
    await app.close(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
    expect(await (await request('/income-recurrences', input, 'POST', alice.cookie, headers)).json()).toEqual(value);
    expect(await (await request(`/income-recurrences/${value.id}/generate`, body, 'POST', alice.cookie, genHeaders)).json()).toEqual(first);
    expect((await request(`/income-recurrences/${value.id}/generate`, { ...body, toPeriod: '2024-05' }, 'POST', alice.cookie, genHeaders)).status).toBe(409);
    expect(await db.scheduledOccurrence.count({ where: { ruleId: value.id } })).toBe(4);
    expect((await (await request(`/income-recurrences/${value.id}/history`)).json()).map((row: any) => row.version)).toEqual([3, 2, 1, 0]);
  });
  it('serializes concurrent new decisions and rejects stale versions, hashes and missing confirmation', async () => {
    const value = await rule(); const p = await preview(value.id); const body = generation(p);
    expect((await request(`/income-recurrences/${value.id}/generate`, { ...body, previewHash: '0'.repeat(64) })).status).toBe(409);
    expect((await request(`/income-recurrences/${value.id}/generate`, { ...body, generationConfirmed: false })).status).toBe(400);
    const responses = await Promise.all([request(`/income-recurrences/${value.id}/generate`, body), request(`/income-recurrences/${value.id}/generate`, body)]); expect(responses.map(row => row.status).sort()).toEqual([201, 409]);
    expect((await request(`/income-recurrences/${value.id}/generate`, body)).status).toBe(409); expect(await db.scheduledOccurrence.count({ where: { ruleId: value.id } })).toBe(3);
  });
  it('rolls back all projections, versions and journals on either journal failure', async () => {
    const value = await rule(); const body = generation(await preview(value.id)); const before = await db.income.count();
    for (const table of ['IncomeCommand', 'RecurrenceCommand']) {
      await db.$executeRawUnsafe(`CREATE FUNCTION reject_recurrence_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictitious failure'; END; $$`);
      await db.$executeRawUnsafe(`CREATE TRIGGER test_journal_failure BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION reject_recurrence_journal()`);
      try { expect((await request(`/income-recurrences/${value.id}/generate`, body)).status).toBe(500); if (table === 'RecurrenceCommand') expect((await request('/income-recurrences', input)).status).toBe(500); }
      finally { await db.$executeRawUnsafe(`DROP TRIGGER test_journal_failure ON "${table}"`); await db.$executeRawUnsafe('DROP FUNCTION reject_recurrence_journal()'); }
      expect(await db.income.count()).toBe(before); expect(await db.scheduledOccurrence.count({ where: { ruleId: value.id } })).toBe(0); expect(await (await request(`/income-recurrences/${value.id}`)).json()).toEqual(value);
    }
  });
  it('isolates every endpoint and typed owner relations and keeps generated edit/cancel behind RF-030', async () => {
    const value = await rule(); const body = generation(await preview(value.id));
    for (const [suffix, data] of [['', undefined], ['/history', undefined], ['/preview', range], ['/generate', body]] as const) { expect((await request(`/income-recurrences/${value.id}${suffix}`, data, data ? 'POST' : 'GET', bob.cookie)).status).toBe(404); expect((await request(`/income-recurrences/${value.id}${suffix}`, data, data ? 'POST' : 'GET', '')).status).toBe(401); }
    expect((await request('/income-recurrences', undefined, 'GET', '')).status).toBe(401); expect((await request('/income-recurrences', input, 'POST', '')).status).toBe(401);
    expect((await (await request('/income-recurrences', undefined, 'GET', bob.cookie)).json()).total).toBe(0);
    const result = await generate(value.id); const item = result.created[0];
    expect((await request(`/incomes/${item.incomeId}`, { expectedVersion: 0, notes: 'Change' }, 'PATCH')).status).toBe(409); expect((await request(`/incomes/${item.incomeId}/cancel`, { expectedVersion: 0 })).status).toBe(409);
    const occurrence = await db.scheduledOccurrence.findUniqueOrThrow({ where: { id: item.occurrenceId } });
    await expect(db.scheduledOccurrence.create({ data: { ...occurrence, id: randomUUID(), userId: bob.id, period: '2024-05' } })).rejects.toThrow();
    await expect(db.scheduledOccurrence.update({ where: { id: occurrence.id }, data: { cents: 0n } })).rejects.toThrow();
    await expect(db.scheduledOccurrence.delete({ where: { id: occurrence.id } })).rejects.toThrow();
    await expect(db.recurrenceRule.update({ where: { id: value.id }, data: { cents: 0n } })).rejects.toThrow();
    const command = await db.recurrenceCommand.findFirstOrThrow({ where: { ruleId: value.id } });
    await expect(db.recurrenceCommand.update({ where: { id: command.id }, data: { result: {} } })).rejects.toThrow();
    await expect(db.recurrenceCommand.delete({ where: { id: command.id } })).rejects.toThrow();
    await expect(db.recurrenceCommand.create({ data: { ...command, id: randomUUID(), key: randomUUID(), userId: bob.id, version: 2 } })).rejects.toThrow();
    await expect(db.income.create({ data: { userId: alice.id, description: 'Forged', expectedOn: new Date('2024-01-31'), expectedAmount: 1n, origin: { kind: 'recurrence', decisionId: 'forged', ruleId: value.id, occurrenceId: randomUUID() }, factEvidence: { expectedOn: { kind: 'user', decisionId: 'forged' }, expectedAmount: { kind: 'user', decisionId: 'forged' } } } })).rejects.toThrow();
  });
  it('validates finite ranges, exact money, origin, keys and JSON without leaking input', async () => {
    for (const patch of [{ endsOn: undefined }, { amount: { currency: 'BRL', cents: '-1' } }, { amount: { currency: 'BRL', cents: '9223372036854775808' } }, { anchorDay: 32 }, { cadence: 'weekly' }, { userId: bob.id }]) expect((await request('/income-recurrences', { ...input, ...patch })).status).toBe(400);
    const value = await rule(); for (const interval of [{ fromPeriod: '2020-01', toPeriod: '2030-01' }, { fromPeriod: '0000-01', toPeriod: '0000-01' }, { ...range, expectedVersion: 0 }]) expect((await request(`/income-recurrences/${value.id}/preview`, interval)).status).toBe(400);
    for (const [path, body] of [['/income-recurrences', input], [`/income-recurrences/${value.id}/preview`, range], [`/income-recurrences/${value.id}/generate`, generation(await preview(value.id))]] as const) expect((await request(path, body, 'POST', alice.cookie, { Origin: 'https://attacker.test' })).status).toBe(403);
    expect((await request('/income-recurrences', input, 'POST', alice.cookie, { 'Idempotency-Key': '' })).status).toBe(400);
    for (const [body, status] of [['{"description":"fictitious-private-value"', 400], [JSON.stringify({ description: 'fictitious-private-value'.repeat(1000) }), 413]] as const) { const response = await fetch(`${base}/api/income-recurrences`, { method: 'POST', headers: { Origin: origin, Cookie: alice.cookie, 'Content-Type': 'application/json' }, body }); expect(response.status).toBe(status); const error = await response.json(); expect(error.code).toBe('INVALID_REQUEST'); expect(JSON.stringify(error)).not.toContain('fictitious-private-value'); }
  });
  it('generates the full 120-month cap atomically with exact zero and records observed duration', async () => {
    const value = await rule({ amount: { currency: 'BRL', cents: '0' } }); const started = performance.now(); const result = await generate(value.id, { fromPeriod: '2020-01', toPeriod: '2029-12' }); const elapsed = Math.round(performance.now() - started);
    console.info(`RF-029 120-month preview+generation: ${elapsed}ms`); expect(result.created).toHaveLength(120); expect(result.rule.version).toBe(1); expect(await db.incomeCommand.count({ where: { incomeId: { in: result.created.map((row: any) => row.incomeId) } } })).toBe(120); expect(elapsed).toBeLessThan(20000);
  });
  it('paginates only owned rules, caps HTTP history at 20 and retains the complete journal', async () => {
    for (let index = 0; index < 26; index++) await rule({ description: `Regra fictícia paginada ${index}` });
    const first = await (await request('/income-recurrences?page=1')).json(); const second = await (await request('/income-recurrences?page=2')).json(); expect(first.rows).toHaveLength(25); expect(second.rows.length).toBeGreaterThan(0); expect(first.total).toBe(second.total);
    expect(new Set([...first.rows, ...second.rows].map((row: any) => row.id)).size).toBe(first.rows.length + second.rows.length);
    for (const query of ['page=0', 'page=1.5', 'page=100000', 'userId=other']) expect((await request(`/income-recurrences?${query}`)).status).toBe(400);
    const value = await rule({ startsOn: '2026-01-01' });
    for (let index = 0; index < 21; index++) await generate(value.id, { fromPeriod: '2025-01', toPeriod: '2025-01' });
    const history = await (await request(`/income-recurrences/${value.id}/history`)).json(); expect(history).toHaveLength(20); expect(history.map((row: any) => row.version)).toEqual(Array.from({ length: 20 }, (_, index) => 21 - index));
    expect(await db.recurrenceCommand.count({ where: { ruleId: value.id } })).toBe(22); expect(await db.scheduledOccurrence.count({ where: { ruleId: value.id } })).toBe(0);
  });
});
