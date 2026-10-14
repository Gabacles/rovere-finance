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
let alice: { id: string; cookie: string }; let bob: typeof alice; let validate: ReturnType<typeof contractValidator>;
const config = () => ({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: origin,
  smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false, importsWorkerEnabled: false });
function request(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', cookie = alice?.cookie ?? '', extra = {}) {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
}
async function register(label: string) {
  const email = `${label}-${randomUUID()}@rovere.test`; const password = 'Fictitious-income-123!';
  const signup = await request('/auth/sign-up/email', { name: label, email, password }); expect(signup.status).toBe(200); const user = (await signup.json()).user;
  const url = new URL(await mailLink(email, 'Confirme')); await fetch(`${base}${url.pathname}${url.search}`, { redirect: 'manual' });
  const login = await request('/auth/sign-in/email', { email, password }); expect(login.status).toBe(200);
  return { id: user.id, cookie: login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
async function income(description = 'Salário fictício previsto', extra = {}) {
  const response = await request('/incomes', { description, ...extra }); expect(response.status).toBe(201);
  const value = await response.json(); expect(validate(value), JSON.stringify(validate.errors)).toBe(true); return value;
}
beforeAll(async () => {
  database = await testDatabase(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  alice = await register('IncomeAlice'); bob = await register('IncomeBob');
  validate = contractValidator(JSON.parse(await readFile('docs/api/openapi.json', 'utf8')), { $ref: '#/components/schemas/Income' });
});
afterAll(async () => { await app?.close(); await database?.close(); });

describe('RF-027 manual planned incomes without cash effects', () => {
  it('persists unknown, confirmed zero, leap dates, extreme civil years and BIGINT exactly', async () => {
    const partial = await income(); expect(partial).toMatchObject({ state: 'planned', version: 0, knowledge: 'partial', facts: { expectedOn: { state: 'unknown' }, expectedAmount: { state: 'unknown' } }, origin: { kind: 'manual' } });
    const zero = await income('Zero explícito', { facts: { expectedOn: '2024-02-29', expectedAmount: { currency: 'BRL', cents: '0' } } });
    expect(zero.facts.expectedAmount).toMatchObject({ state: 'confirmed', value: { cents: '0' }, evidence: { kind: 'user', decisionId: zero.origin.decisionId } }); expect(zero.knowledge).toBe('complete');
    for (const expectedOn of ['0001-01-01', '9999-12-31']) {
      const value = await income('Limite fictício', { facts: { expectedOn, expectedAmount: { currency: 'BRL', cents: '9223372036854775807' } } });
      expect(await (await request(`/incomes/${value.id}`)).json()).toEqual(value);
      expect((await db.income.findUniqueOrThrow({ where: { id: value.id } })).expectedAmount).toBe(9223372036854775807n);
    }
  });
  it('recovers concurrent lost create responses after edits, cancellation and application restart', async () => {
    const headers = { 'Idempotency-Key': randomUUID() }; const body = { description: 'Resposta perdida fictícia' };
    const responses = await Promise.all([request('/incomes', body, 'POST', alice.cookie, headers), request('/incomes', body, 'POST', alice.cookie, headers)]);
    expect(responses.map(value => value.status)).toEqual([201, 201]); const first = await responses[0]!.json(); expect(await responses[1]!.json()).toEqual(first);
    const editBody = { expectedVersion: 0, notes: 'Correção manual fictícia' }; const editHeaders = { 'Idempotency-Key': randomUUID() };
    const edited = await (await request(`/incomes/${first.id}`, editBody, 'PATCH', alice.cookie, editHeaders)).json(); expect(edited.version).toBe(1);
    const cancelBody = { expectedVersion: 1 }; const cancelHeaders = { 'Idempotency-Key': randomUUID() };
    const cancelled = await (await request(`/incomes/${first.id}/cancel`, cancelBody, 'POST', alice.cookie, cancelHeaders)).json(); expect(cancelled.state).toBe('cancelled');
    await app.close(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
    expect(await (await request('/incomes', body, 'POST', alice.cookie, headers)).json()).toEqual(first);
    expect(await (await request(`/incomes/${first.id}`, editBody, 'PATCH', alice.cookie, editHeaders)).json()).toEqual(edited);
    expect(await (await request(`/incomes/${first.id}/cancel`, cancelBody, 'POST', alice.cookie, cancelHeaders)).json()).toEqual(cancelled);
    expect((await request('/incomes', { description: 'Payload diferente' }, 'POST', alice.cookie, headers)).status).toBe(409);
    expect((await request(`/incomes/${first.id}`, { expectedVersion: 2, notes: 'Outra ação' }, 'PATCH', alice.cookie, cancelHeaders)).status).toBe(409);
    expect((await request('/incomes', body, 'POST', bob.cookie, headers)).status).toBe(201);
    expect(await db.income.count({ where: { userId: alice.id, description: body.description } })).toBe(1);
    expect(await db.incomeCommand.count({ where: { incomeId: first.id } })).toBe(3);
  });
  it('preserves facts and origin on omitted fields and records explicit clearing/history', async () => {
    const item = await income('Histórico fictício', { facts: { expectedOn: '2026-11-30', expectedAmount: { currency: 'BRL', cents: '500000' } } });
    const edited = await (await request(`/incomes/${item.id}`, { expectedVersion: 0, description: 'Corrigida' }, 'PATCH')).json(); expect(edited.facts).toEqual(item.facts); expect(edited.origin).toEqual(item.origin);
    const cleared = await (await request(`/incomes/${item.id}`, { expectedVersion: 1, facts: { expectedAmount: null } }, 'PATCH')).json();
    expect(cleared.facts.expectedOn).toEqual(item.facts.expectedOn); expect(cleared.facts.expectedAmount).toEqual({ state: 'unknown' }); expect(cleared.knowledge).toBe('partial');
    const cancelled = await (await request(`/incomes/${item.id}/cancel`, { expectedVersion: 2 })).json(); expect(cancelled.facts).toEqual(cleared.facts); expect(cancelled.origin).toEqual(item.origin);
    const history = await (await request(`/incomes/${item.id}/history`)).json(); expect(history.map((row: any) => row.version)).toEqual([3, 2, 1, 0]);
    const historyValidator = contractValidator(JSON.parse(await readFile('docs/api/openapi.json', 'utf8')), { $ref: '#/components/schemas/IncomeHistory' });
    expect(historyValidator(history), JSON.stringify(historyValidator.errors)).toBe(true); expect(validate(cancelled), JSON.stringify(validate.errors)).toBe(true);
    expect(history[1].changes.previous.facts).toEqual(item.facts); expect(history[0].changes.action).toBe('cancel');
    expect((await request(`/incomes/${item.id}`, { expectedVersion: 3, notes: 'Não reabrir' }, 'PATCH')).status).toBe(409);
    expect((await request(`/incomes/${item.id}/cancel`, { expectedVersion: 3 })).status).toBe(409);
    await expect(db.incomeCommand.update({ where: { id: history[0].id }, data: { version: 9 } })).rejects.toThrow();
    await expect(db.incomeCommand.delete({ where: { id: history[0].id } })).rejects.toThrow();
    await expect(db.income.update({ where: { id: item.id }, data: { state: 'planned' } })).rejects.toThrow();
    await expect(db.income.delete({ where: { id: item.id } })).rejects.toThrow();
  });
  it('serializes edit versus cancel and rejects stale decisions without changing journal', async () => {
    const item = await income();
    const responses = await Promise.all([request(`/incomes/${item.id}`, { expectedVersion: 0, description: 'Edição concorrente' }, 'PATCH'), request(`/incomes/${item.id}/cancel`, { expectedVersion: 0 })]);
    expect(responses.filter(value => value.status === 409)).toHaveLength(1);
    expect(responses.filter(value => [200, 201].includes(value.status))).toHaveLength(1);
    const current = await (await request(`/incomes/${item.id}`)).json(); expect(current.version).toBe(1);
    expect(await db.incomeCommand.count({ where: { incomeId: item.id } })).toBe(2);
    expect((await request(`/incomes/${item.id}`, { expectedVersion: 0, notes: 'Obsoleta' }, 'PATCH')).status).toBe(409);
    expect(await (await request(`/incomes/${item.id}`)).json()).toEqual(current);
  });
  it('isolates every read/write and composite command relation across two owners', async () => {
    const item = await income();
    for (const suffix of ['', '/history']) expect((await request(`/incomes/${item.id}${suffix}`, undefined, 'GET', bob.cookie)).status).toBe(404);
    expect((await request(`/incomes/${item.id}`, { expectedVersion: 0, notes: 'Foreign' }, 'PATCH', bob.cookie)).status).toBe(404);
    expect((await request(`/incomes/${item.id}/cancel`, { expectedVersion: 0 }, 'POST', bob.cookie)).status).toBe(404);
    const command = await db.incomeCommand.findUniqueOrThrow({ where: { id: item.origin.decisionId } });
    await expect(db.incomeCommand.create({ data: { ...command, id: randomUUID(), userId: bob.id, key: randomUUID(), version: 1 } })).rejects.toThrow();
    expect((await (await request('/incomes', undefined, 'GET', bob.cookie)).json()).rows.every((row: any) => row.id !== item.id)).toBe(true);
    for (const [path, body, method] of [['/incomes', undefined, 'GET'], ['/incomes', { description: 'No session' }, 'POST'], [`/incomes/${item.id}`, undefined, 'GET'], [`/incomes/${item.id}/history`, undefined, 'GET'], [`/incomes/${item.id}`, { expectedVersion: 0, notes: null }, 'PATCH'], [`/incomes/${item.id}/cancel`, { expectedVersion: 0 }, 'POST']] as const) expect((await request(path, body, method, '')).status).toBe(401);
  });
  it('rolls back creation, edits, cancellation, versions and journal on journal failure', async () => {
    const item = await income(); const before = await db.income.count(); const commands = await db.incomeCommand.count();
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_income_command() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictitious journal failure'; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER test_income_command_failure BEFORE INSERT ON "IncomeCommand" FOR EACH ROW EXECUTE FUNCTION reject_income_command()`);
    try {
      expect((await request('/incomes', { description: 'Rollback' })).status).toBe(500);
      expect((await request(`/incomes/${item.id}`, { expectedVersion: 0, facts: { expectedAmount: { currency: 'BRL', cents: '1' } } }, 'PATCH')).status).toBe(500);
      expect((await request(`/incomes/${item.id}/cancel`, { expectedVersion: 0 })).status).toBe(500);
    } finally { await db.$executeRawUnsafe('DROP TRIGGER test_income_command_failure ON "IncomeCommand"'); await db.$executeRawUnsafe('DROP FUNCTION reject_income_command()'); }
    expect(await db.income.count()).toBe(before); expect(await db.incomeCommand.count()).toBe(commands); expect(await (await request(`/incomes/${item.id}`)).json()).toEqual(item);
  });
  it('validates money/date/extra fields, versions, keys, origin, JSON and body limits safely', async () => {
    for (const body of [{ description: 'x', userId: bob.id }, { description: 'x', state: 'paid' }, { description: 'x', facts: { expectedOn: '2025-02-29' } }, ...[-1, '1.1', '1e3', '+1', '-0', '-1', '9223372036854775808'].map(cents => ({ description: 'x', facts: { expectedAmount: { currency: 'BRL', cents } } }))]) expect((await request('/incomes', body)).status).toBe(400);
    const item = await income();
    for (const expectedVersion of [-1, 0.1, '0', 2147483647]) expect((await request(`/incomes/${item.id}/cancel`, { expectedVersion })).status).toBe(400);
    expect((await request(`/incomes/${item.id}`, { expectedVersion: 0 }, 'PATCH')).status).toBe(400);
    expect((await request(`/incomes/${item.id}/cancel`, { expectedVersion: 0, received: true })).status).toBe(400);
    for (const [path, body, method] of [['/incomes', { description: 'x' }, 'POST'], [`/incomes/${item.id}`, { expectedVersion: 0, notes: null }, 'PATCH'], [`/incomes/${item.id}/cancel`, { expectedVersion: 0 }, 'POST']] as const) {
      expect((await request(path, body, method, alice.cookie, { 'Idempotency-Key': '' })).status).toBe(400);
      expect((await request(path, body, method, alice.cookie, { Origin: 'https://attacker.test' })).status).toBe(403);
    }
    for (const [body, status] of [['{"notes":"fictitious-private-value"', 400], [JSON.stringify({ description: 'fictitious-private-value'.repeat(1000) }), 413]] as const) {
      const response = await fetch(`${base}/api/incomes`, { method: 'POST', headers: { Origin: origin, Cookie: alice.cookie, 'Content-Type': 'application/json' }, body });
      expect(response.status).toBe(status); const error = await response.json(); expect(error.code).toBe('INVALID_REQUEST'); expect(JSON.stringify(error)).not.toContain('fictitious-private-value'); expect(error.requestId).toBeTruthy();
    }
  });
  it('enforces SQL checks, permanent origin and owner, nonnegative amounts and manual evidence', async () => {
    const base = { userId: alice.id, description: 'SQL fictício', origin: { kind: 'manual', decisionId: 'manual-fictitious' } };
    for (const extra of [{ expectedAmount: -1n }, { expectedAmount: 0n }, { currency: 'USD' }, { description: ' ' }, { version: -1 }, { state: 'received' }, { origin: {} }, { expectedAmount: 0n, factEvidence: { expectedAmount: { kind: 'source', sourceRecordId: 'x' } } }]) await expect(db.income.create({ data: { ...base, ...extra } })).rejects.toThrow();
    const item = await income();
    await expect(db.income.update({ where: { id: item.id }, data: { origin: { kind: 'manual', decisionId: 'changed' } } })).rejects.toThrow();
    await expect(db.income.update({ where: { id: item.id }, data: { userId: bob.id } })).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE "Income" SET "expectedOn" = DATE '10000-01-01' WHERE "id" = ${item.id}`).rejects.toThrow();
  });
  it('paginates forecasts and bounds history without financial totals or movements', async () => {
    for (let i = 0; i < 26; i++) await income(`Previsão fictícia ${i}`);
    const first = await (await request('/incomes?page=1')).json(); const second = await (await request('/incomes?page=2')).json(); expect(first.rows).toHaveLength(25); expect(second.rows.length).toBeGreaterThan(0);
    const document = JSON.parse(await readFile('docs/api/openapi.json', 'utf8')); const pageValidator = contractValidator(document, document.paths['/api/incomes'].get.responses['200'].content['application/json'].schema); expect(pageValidator(first)).toBe(true);
    expect(first.total).toBe(await db.income.count({ where: { userId: alice.id } })); expect(first).not.toHaveProperty('totalCents'); expect(new Set([...first.rows, ...second.rows].map(row => row.id)).size).toBe(first.rows.length + second.rows.length);
    for (const query of ['page=0', 'page=1&userId=other', 'page=100000']) expect((await request(`/incomes?${query}`)).status).toBe(400);
    const item = await income(); for (let version = 0; version < 21; version++) expect((await request(`/incomes/${item.id}`, { expectedVersion: version, notes: `Nota ${version}` }, 'PATCH')).status).toBe(200);
    expect(await db.incomeCommand.count({ where: { incomeId: item.id } })).toBe(22); expect(await (await request(`/incomes/${item.id}/history`)).json()).toHaveLength(20);
    for (const model of [db.bankEntry, db.cardCharge, db.statement, db.expense, db.statementPaymentAllocation]) expect(await (model.count as () => Promise<number>)()).toBe(0);
  });
});
