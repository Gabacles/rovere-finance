import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { mailLink } from '../../../scripts/test-mail.mjs';

const origin = 'http://127.0.0.1:18080';
let database: Awaited<ReturnType<typeof testDatabase>>; let db: ReturnType<typeof createDatabase>; let app: Awaited<ReturnType<typeof createApp>>; let base: string;
let alice: { id: string; cookie: string }; let bob: typeof alice; let credit: { id: string }; let secondCredit: typeof credit; let statement: { id: string };
const config = () => ({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: origin,
  smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false, importsWorkerEnabled: false });
function request(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', cookie = alice?.cookie ?? '', extra = {}) {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
}
async function register(label: string) {
  const email = `${label}-${randomUUID()}@rovere.test`; const password = 'Fictitious-statement-123!';
  const signup = await request('/auth/sign-up/email', { name: label, email, password }); expect(signup.status).toBe(200); const user = (await signup.json()).user;
  const url = new URL(await mailLink(email, 'Confirme')); await fetch(`${base}${url.pathname}${url.search}`, { redirect: 'manual' });
  const login = await request('/auth/sign-in/email', { email, password }); expect(login.status).toBe(200);
  return { id: user.id, cookie: login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
const path = () => `/credit-accounts/${credit.id}/statements/${statement.id}`;
beforeAll(async () => {
  database = await testDatabase(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  alice = await register('Alice'); bob = await register('Bob');
  credit = await (await request('/credit-accounts', { name: 'Crédito fictício' })).json(); secondCredit = await (await request('/credit-accounts', { name: 'Outro crédito' })).json();
  statement = await (await request(`/credit-accounts/${credit.id}/statements`, { period: '2026-10' })).json();
});
afterAll(async () => { await app?.close(); await database?.close(); });

describe('RF-020 explicit statement facts against PostgreSQL', () => {
  it('reads unknown defaults without inventing date, zero or open cycle', async () => {
    const value = await (await request(path())).json(); expect(value.version).toBe(0); expect(value.period).toBe('2026-10');
    expect(Object.values(value.facts).every((fact: any) => fact.state === 'unknown')).toBe(true);
    expect(await (await request(`${path()}/history`)).json()).toEqual([]);
    expect(await (await request(`/credit-accounts/${credit.id}/statements`)).json()).toEqual([{ id: statement.id, creditAccountId: credit.id, period: '2026-10', periodOrigin: 'manual' }]);
  });
  it('stores zero and dates explicitly with immutable history, preserving unrelated facts', async () => {
    let response = await request(path(), { expectedVersion: 0, facts: { closingOn: '2026-09-30', declaredTotal: { currency: 'BRL', cents: '0' } } }, 'PATCH'); expect(response.status).toBe(200);
    const first = await response.json(); expect(first.facts.declaredTotal).toMatchObject({ state: 'confirmed', value: { currency: 'BRL', cents: '0' } }); expect(first.facts.cycle.state).toBe('unknown');
    response = await request(path(), { expectedVersion: 1, facts: { dueOn: '2026-11-05', cycle: 'closed' } }, 'PATCH'); expect(response.status).toBe(200);
    const next = await response.json(); expect(next.period).toBe('2026-10'); expect(next.facts.closingOn).toEqual(first.facts.closingOn); expect(next.facts.declaredTotal).toEqual(first.facts.declaredTotal);
    const history = await (await request(`${path()}/history`)).json(); expect(history.map((item: any) => item.version)).toEqual([2, 1]);
    expect(history[1].id).toBe(first.facts.declaredTotal.evidence.decisionId); expect(history[1].changes.previous.declaredTotal.state).toBe('unknown');
    await expect(db.statementFactChange.update({ where: { id: history[0].id }, data: { changes: {} } })).rejects.toThrow();
  });
  it('rejects stale and concurrent edits with no lost history', async () => {
    expect((await request(path(), { expectedVersion: 0, facts: { cycle: 'open' } }, 'PATCH')).status).toBe(409);
    const responses = await Promise.all([request(path(), { expectedVersion: 2, facts: { dueOn: '2026-11-06' } }, 'PATCH'), request(path(), { expectedVersion: 2, facts: { dueOn: '2026-11-07' } }, 'PATCH')]);
    expect(responses.map(value => value.status).sort()).toEqual([200, 409]); expect(await db.statementFactChange.count({ where: { statementId: statement.id } })).toBe(3);
    expect((await (await request(path())).json()).version).toBe(3);
  });
  it('denies anonymous/cross-user/cross-credit read, update and history', async () => {
    for (const route of [path(), `${path()}/history`]) {
      expect((await request(route, undefined, 'GET', '')).status).toBe(401); expect((await request(route, undefined, 'GET', bob.cookie)).status).toBe(404);
    }
    expect((await request(path(), { expectedVersion: 3, facts: { cycle: 'open' } }, 'PATCH', bob.cookie)).status).toBe(404);
    expect((await request(`/credit-accounts/${secondCredit.id}/statements/${statement.id}`)).status).toBe(404);
    await expect(db.statementFactChange.create({ data: { userId: bob.id, creditAccountId: credit.id, statementId: statement.id, version: 100, changes: {} } })).rejects.toThrow();
    expect((await request(path(), { expectedVersion: 3, facts: { cycle: 'open' }, userId: bob.id }, 'PATCH')).status).toBe(400);
  });
  it('validates input and prevents paid status or hidden changes to period/charges', async () => {
    for (const facts of [{ dueOn: '2026-02-30' }, { cycle: 'paid' }, { declaredTotal: { currency: 'USD', cents: '100' } }, { declaredTotal: { currency: 'BRL', cents: 1.2 } },
      { declaredTotal: { currency: 'BRL', cents: '9223372036854775808' } }, { period: '2026-11' }, { paid: true }, {}]) {
      const response = await request(path(), { expectedVersion: 3, facts }, 'PATCH'); expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: 'INVALID_STATEMENT_FACTS', requestId: expect.any(String) });
    }
    expect((await request(path(), { facts: { cycle: 'open' } }, 'PATCH')).status).toBe(400);
    expect((await request(path(), { expectedVersion: 3, facts: { cycle: 'open' } }, 'PATCH', alice.cookie, { Origin: 'https://attacker.test' })).status).toBe(403);
    const malformed = await fetch(`${base}/api${path()}`, { method: 'PATCH', headers: { Origin: origin, Cookie: alice.cookie, 'Content-Type': 'application/json' }, body: '{"total":"private-fictitious-value"' });
    expect(malformed.status).toBe(400); expect(await malformed.text()).not.toContain('private-fictitious-value');
    expect((await (await request(path())).json()).version).toBe(3);
    await expect(db.statement.update({ where: { id: statement.id }, data: { cycle: 'paid' } })).rejects.toThrow();
    const unrecorded = await db.statement.create({ data: { userId: alice.id, creditAccountId: credit.id, period: '2026-12', creationKey: randomUUID() } });
    await expect(db.statement.update({ where: { id: unrecorded.id }, data: { cycle: 'open' } })).rejects.toThrow();
  });
  it('rolls back facts if the history write fails', async () => {
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_statement_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictitious history failure'; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER test_statement_history_failure BEFORE INSERT ON "StatementFactChange" FOR EACH ROW EXECUTE FUNCTION reject_statement_history()`);
    const before = await (await request(path())).json();
    try { expect((await request(path(), { expectedVersion: 3, facts: { cycle: 'open' } }, 'PATCH')).status).toBe(500); }
    finally { await db.$executeRawUnsafe('DROP TRIGGER test_statement_history_failure ON "StatementFactChange"'); await db.$executeRawUnsafe('DROP FUNCTION reject_statement_history()'); }
    expect(await (await request(path())).json()).toEqual(before); expect(await db.statementFactChange.count({ where: { statementId: statement.id } })).toBe(3);
  });
  it('clears assertions explicitly while preserving history and persists across restart', async () => {
    const response = await request(path(), { expectedVersion: 3, facts: { declaredTotal: null, cycle: null } }, 'PATCH'); expect(response.status).toBe(200);
    const next = await response.json(); expect(next.facts.declaredTotal.state).toBe('unknown'); expect(next.facts.cycle.state).toBe('unknown'); expect(next.facts.closingOn.state).toBe('confirmed');
    await app.close(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
    expect(await (await request(path())).json()).toEqual(next); expect((await (await request(`${path()}/history`)).json())[0].changes.previous.declaredTotal.value.cents).toBe('0');
  });
  it('does not turn a closed declaration into payment or prevent historical import', async () => {
    const response = await request(path(), { expectedVersion: 4, facts: { cycle: 'closed', declaredTotal: { currency: 'BRL', cents: '9223372036854775807' } } }, 'PATCH'); expect(response.status).toBe(200);
    const value = await response.json(); expect(value.facts.declaredTotal.value.cents).toBe('9223372036854775807'); expect(value.period).toBe('2026-10'); expect(value).not.toHaveProperty('paid'); expect(value).not.toHaveProperty('balance');
    const form = new FormData(); form.append('format', 'csv'); form.append('configuration', JSON.stringify({ profile: { id: 'facts-test', encoding: 'utf-8', delimiter: ';', headerLine: 1, dateFormat: 'YMD', decimal: '.', grouping: null, sign: 'as-is', currency: 'BRL', kind: 'card', columns: { date: 'Date', description: 'Description', amount: 'Amount' } } }));
    form.append('file', new Blob(['Date;Description;Amount\n2026-10-08;Fictitious;-1.00']), 'fictitious.csv');
    const uploaded = await (await fetch(`${base}/api/imports`, { method: 'POST', headers: { Origin: origin, Cookie: alice.cookie, 'Idempotency-Key': randomUUID() }, body: form })).json();
    const { ImportWorker } = await import('../src/imports/worker.js'); await app.get(ImportWorker).runOnce();
    const batch = await (await request(`/imports/${uploaded.id}`)).json(); const saved = await (await request(`/imports/${batch.id}/review`, { expectedVersion: batch.version, blocks: [{ id: batch.blocks[0].id, creditAccountId: credit.id, statementId: statement.id }] }, 'PATCH')).json();
    expect((await request(`/imports/${batch.id}/confirm`, { expectedVersion: saved.version })).status).toBe(201);
    expect(await (await request(path())).json()).toEqual(value); expect(await db.cardCharge.count()).toBe(1);
  });
});
