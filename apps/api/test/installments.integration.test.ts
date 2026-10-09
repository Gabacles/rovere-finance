import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { ImportWorker } from '../src/imports/worker.js';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { mailLink } from '../../../scripts/test-mail.mjs';

const origin = 'http://127.0.0.1:18080';
let database: Awaited<ReturnType<typeof testDatabase>>; let db: ReturnType<typeof createDatabase>; let app: Awaited<ReturnType<typeof createApp>>; let base: string;
let alice: { id: string; cookie: string }; let bob: typeof alice; let credit: { id: string }; let otherCredit: typeof credit; let first: { id: string }; let second: typeof first;
const config = () => ({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: origin, smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false, importsWorkerEnabled: false });
function request(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', cookie = alice?.cookie ?? '', extra = {}) {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function register(label: string) {
  const email = `${label}-${randomUUID()}@rovere.test`; const password = 'Fictitious-installment-123!'; const signup = await request('/auth/sign-up/email', { name: label, email, password }); expect(signup.status).toBe(200); const user = (await signup.json()).user;
  const url = new URL(await mailLink(email, 'Confirme')); await fetch(`${base}${url.pathname}${url.search}`, { redirect: 'manual' });
  const login = await request('/auth/sign-in/email', { email, password }); expect(login.status).toBe(200); return { id: user.id, cookie: login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
const path = (id: string) => `/expenses/${id}/installment-plan`;
const planInput = (overrides = {}) => ({ expectedVersion: 0, total: { currency: 'BRL', cents: '10000' }, count: 3, creditAccountId: credit.id, firstPeriod: '2026-12', cadence: 'monthly', ...overrides });
async function purchase(known = true) { const response = await request('/expenses', { description: 'Compra manual fictícia', notes: 'Correção preservada', ...(known ? { facts: { total: { currency: 'BRL', cents: '10000' } } } : {}) }); expect(response.status).toBe(201); return response.json(); }
async function planned() { const item = await purchase(); const response = await request(path(item.id), planInput()); expect(response.status).toBe(201); return response.json(); }
async function charge(overrides = {}) { return db.cardCharge.create({ data: { userId: alice.id, creditAccountId: credit.id, statementId: first.id, postedOn: new Date('2026-12-08T00:00:00Z'), description: 'Cobrança fictícia', cents: -3335n, fingerprint: randomUUID().replaceAll('-', '').padEnd(64, '0'), installment: { state: 'unknown' }, ...overrides } }); }
const matchInput = (version: number, chargeId: string, overrides = {}) => ({ expectedVersion: version, number: 1, chargeId, confirmedAmount: { currency: 'BRL', cents: '3335' }, ...overrides });
async function importFile(text: string, format: 'csv' | 'ofx', statementId: string) {
  const form = new FormData(); form.append('format', format); form.append('configuration', JSON.stringify(format === 'ofx' ? {} : { profile: { id: 'plan-fixture', encoding: 'utf-8', delimiter: ';', headerLine: 1, dateFormat: 'YMD', decimal: '.', grouping: null, sign: 'as-is', currency: 'BRL', kind: 'card', columns: { date: 'Date', description: 'Description', amount: 'Amount', externalId: 'ID' } } }));
  form.append('file', new Blob([text]), `fictitious.${format}`); const uploaded = await fetch(`${base}/api/imports`, { method: 'POST', headers: { Origin: origin, Cookie: alice.cookie, 'Idempotency-Key': randomUUID() }, body: form }); expect(uploaded.status).toBe(201);
  const batch = await uploaded.json(); await app.get(ImportWorker).runOnce(); const current = await (await request(`/imports/${batch.id}`)).json();
  const saved = await (await request(`/imports/${batch.id}/review`, { expectedVersion: current.version, blocks: [{ id: current.blocks[0].id, creditAccountId: credit.id, statementId }] }, 'PATCH')).json();
  const response = await request(`/imports/${batch.id}/confirm`, { expectedVersion: saved.version }); expect(response.status).toBe(201); return response.json();
}
beforeAll(async () => {
  database = await testDatabase(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); alice = await register('Alice'); bob = await register('Bob');
  credit = await (await request('/credit-accounts', { name: 'Crédito do plano' })).json(); otherCredit = await (await request('/credit-accounts', { name: 'Outro crédito' })).json();
  first = await (await request(`/credit-accounts/${credit.id}/statements`, { period: '2026-12' })).json(); second = await (await request(`/credit-accounts/${credit.id}/statements`, { period: '2027-01' })).json();
});
afterAll(async () => { await app?.close(); await database?.close(); });

describe('RF-022 confirmed forecasts against PostgreSQL', () => {
  it('generates exact monthly forecasts only after total confirmation, keeping original date unknown', async () => {
    const unknown = await purchase(false); expect((await request(path(unknown.id), planInput())).status).toBe(409);
    const item = await purchase(); const statementCount = await db.statement.count(); const result = await request(path(item.id), planInput()); expect(result.status).toBe(201); const value = await result.json();
    expect(value.version).toBe(1); expect(value.knowledge).toBe('partial'); expect(value.facts).toEqual(item.facts); expect(value.installmentPlan.forecasts.map((row: any) => row.plannedAmount.cents)).toEqual(['3334', '3333', '3333']);
    expect(value.installmentPlan.forecasts.map((row: any) => row.period)).toEqual(['2026-12', '2027-01', '2027-02']); expect(value.installmentPlan.forecasts.every((row: any) => row.state === 'planned' && row.actual === null)).toBe(true);
    expect(await db.cardCharge.count()).toBe(0); expect(await db.bankEntry.count()).toBe(0); expect(await db.statement.count()).toBe(statementCount); expect(value.installmentPlan.evidence.kind).toBe('user');
  });
  it('replays concurrent creation and original result after later edits, sharing command key scope', async () => {
    const item = await purchase(); const body = planInput(); const headers = { 'Idempotency-Key': randomUUID() };
    const responses = await Promise.all([request(path(item.id), body, 'POST', alice.cookie, headers), request(path(item.id), body, 'POST', alice.cookie, headers)]); expect(responses.map(row => row.status)).toEqual([201, 201]);
    const value = await responses[0]!.json(); expect(await responses[1]!.json()).toEqual(value); expect(await db.installmentPlan.count({ where: { expenseId: item.id } })).toBe(1);
    expect((await request(`/expenses/${item.id}`, { expectedVersion: 1, description: 'Corrigida' }, 'PATCH')).status).toBe(200);
    expect(await (await request(path(item.id), body, 'POST', alice.cookie, headers)).json()).toEqual(value);
    expect((await request(path(item.id), { ...body, count: 4 }, 'POST', alice.cookie, headers)).status).toBe(409);
    expect((await request(`/expenses/${item.id}`, { expectedVersion: 2, description: 'Outra' }, 'PATCH', alice.cookie, headers)).status).toBe(409);
    expect((await request(path(item.id), planInput({ expectedVersion: 2 }))).status).toBe(409);
  });
  it('matches a known charge explicitly, preserves origin and shows actual difference without redistribution', async () => {
    const item = await purchase(); const target = await charge({ installment: { state: 'confirmed', value: { number: 1, total: { state: 'unknown' } }, evidence: { kind: 'user', decisionId: 'fictitious' } } });
    expect((await request(`/expenses/${item.id}`, { expectedVersion: 0, association: { action: 'link', chargeId: target.id } }, 'PATCH')).status).toBe(200);
    const created = await (await request(path(item.id), planInput({ expectedVersion: 1 }))).json(); expect(created.installmentPlan.forecasts[0].state).toBe('planned');
    const body = matchInput(2, target.id); const headers = { 'Idempotency-Key': randomUUID() }; const response = await request(`${path(item.id)}/matches`, body, 'POST', alice.cookie, headers); expect(response.status).toBe(201); const value = await response.json();
    const forecast = value.installmentPlan.forecasts[0]; expect(forecast).toMatchObject({ state: 'recorded', plannedAmount: { cents: '3334' }, actual: { confirmedAmount: { cents: '3335' }, charge: { id: target.id, amount: { cents: '-3335' } } }, difference: { cents: '1' } });
    expect(value.installmentPlan.forecasts.slice(1).map((row: any) => row.plannedAmount.cents)).toEqual(['3333', '3333']); expect(value.facts).toEqual(item.facts); expect(await db.cardCharge.findUniqueOrThrow({ where: { id: target.id } })).toEqual(target);
    expect(await (await request(`${path(item.id)}/matches`, body, 'POST', alice.cookie, headers)).json()).toEqual(value);
    await expect(db.installmentMatch.update({ where: { chargeId: target.id }, data: { confirmedCents: 1n } })).rejects.toThrow();
  });
  it('allows only one concurrent winner per forecast and preserves the losing charge', async () => {
    const item = await planned(); const targets = await Promise.all([charge(), charge()]);
    const responses = await Promise.all(targets.map(target => request(`${path(item.id)}/matches`, matchInput(item.version, target.id)))); expect(responses.map(row => row.status).sort()).toEqual([201, 409]);
    const loser = targets[responses[0]!.status === 409 ? 0 : 1]!; expect(await db.expenseCharge.findUnique({ where: { chargeId: loser.id } })).toBeNull(); expect(await db.cardCharge.findUniqueOrThrow({ where: { id: loser.id } })).toEqual(loser);
    expect(await db.installmentMatch.count({ where: { expenseId: item.id } })).toBe(1);
  });
  it('rejects another purchase using the same charge under concurrent decisions', async () => {
    const a = await planned(); const b = await planned(); const target = await charge();
    const responses = await Promise.all([a, b].map(item => request(`${path(item.id)}/matches`, matchInput(item.version, target.id)))); expect(responses.map(row => row.status).sort()).toEqual([201, 409]);
    const loser = responses[0]!.status === 409 ? a : b; expect(await (await request(`/expenses/${loser.id}`)).json()).toEqual(loser); expect(await db.installmentMatch.count({ where: { chargeId: target.id } })).toBe(1);
  });
  it('rejects contradictory credit/period/known installment/amount and isolates users/FKs', async () => {
    const item = await planned(); const otherStatement = await (await request(`/credit-accounts/${otherCredit.id}/statements`, { period: '2026-12' })).json();
    for (const overrides of [{ statementId: second.id }, { creditAccountId: otherCredit.id, statementId: otherStatement.id }, { installment: { state: 'confirmed', value: { number: 2, total: { state: 'unknown' } }, evidence: { kind: 'user', decisionId: 'fictitious' } } }, { installment: { state: 'confirmed', value: { number: 1, total: { state: 'confirmed', value: 4, evidence: { kind: 'user', decisionId: 'fictitious' } } }, evidence: { kind: 'user', decisionId: 'fictitious' } } }]) {
      const target = await charge(overrides); expect((await request(`${path(item.id)}/matches`, matchInput(item.version, target.id))).status).toBe(409); expect(await db.expenseCharge.findUnique({ where: { chargeId: target.id } })).toBeNull();
    }
    const target = await charge(); expect((await request(`${path(item.id)}/matches`, matchInput(item.version, target.id, { confirmedAmount: { currency: 'BRL', cents: '3334' } }))).status).toBe(409);
    expect((await request(path(item.id), planInput(), 'POST', bob.cookie)).status).toBe(404); expect((await request(`${path(item.id)}/matches`, matchInput(item.version, target.id), 'POST', bob.cookie)).status).toBe(404);
    const bobCredit = await (await request('/credit-accounts', { name: 'Bob' }, 'POST', bob.cookie)).json(); const bobStatement = await (await request(`/credit-accounts/${bobCredit.id}/statements`, { period: '2026-12' }, 'POST', bob.cookie)).json(); const foreign = await charge({ userId: bob.id, creditAccountId: bobCredit.id, statementId: bobStatement.id });
    expect((await request(`${path(item.id)}/matches`, matchInput(item.version, foreign.id))).status).toBe(404);
    await expect(db.installmentPlan.create({ data: { userId: bob.id, expenseId: item.id, creditAccountId: bobCredit.id, total: 1n, count: 1, firstPeriod: '2026-12', evidence: {} } })).rejects.toThrow();
    await expect(db.installmentMatch.create({ data: { forecastId: item.installmentPlan.forecasts[0].id, userId: bob.id, expenseId: item.id, chargeId: foreign.id, confirmedCents: 3335n, evidence: {} } })).rejects.toThrow();
    expect(await (await request(`/expenses/${item.id}`)).json()).toEqual(item);
  });
  it('protects plan total and requires unmatch before unlinking, preserving immutable forecasts', async () => {
    const item = await planned();
    for (const total of [null, { currency: 'BRL', cents: '10001' }]) expect((await request(`/expenses/${item.id}`, { expectedVersion: item.version, facts: { total } }, 'PATCH')).status).toBe(409);
    expect((await request(`/expenses/${item.id}`, { expectedVersion: item.version, notes: 'Editada', facts: { purchasedOn: '2026-11-01' } }, 'PATCH')).status).toBe(200);
    const target = await charge(); const linked = await (await request(`${path(item.id)}/matches`, matchInput(2, target.id))).json();
    expect((await request(`/expenses/${item.id}`, { expectedVersion: linked.version, association: { action: 'unlink', chargeId: target.id } }, 'PATCH')).status).toBe(409);
    await expect(db.expenseCharge.delete({ where: { chargeId: target.id } })).rejects.toThrow();
    const removed = await (await request(`${path(item.id)}/matches/1/remove`, { expectedVersion: linked.version })).json(); expect(removed.charges).toHaveLength(1); expect(removed.installmentPlan.forecasts[0]).toMatchObject({ state: 'planned', actual: null, difference: null });
    expect((await request(`/expenses/${item.id}`, { expectedVersion: removed.version, association: { action: 'unlink', chargeId: target.id } }, 'PATCH')).status).toBe(200);
    await expect(db.installmentPlan.update({ where: { id: item.installmentPlan.id }, data: { total: 5n } })).rejects.toThrow(); await expect(db.installmentForecast.update({ where: { id: item.installmentPlan.forecasts[0].id }, data: { plannedCents: 5n } })).rejects.toThrow();
  });
  it('rolls back plan and forecasts if a forecast insert fails, without publishing version/history', async () => {
    const item = await purchase(); await db.$executeRawUnsafe(`CREATE FUNCTION reject_plan_forecast() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."number" = 2 THEN RAISE EXCEPTION 'Fictitious forecast failure'; END IF; RETURN NEW; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER test_forecast_failure BEFORE INSERT ON "InstallmentForecast" FOR EACH ROW EXECUTE FUNCTION reject_plan_forecast()`);
    try { expect((await request(path(item.id), planInput())).status).toBe(500); } finally { await db.$executeRawUnsafe('DROP TRIGGER test_forecast_failure ON "InstallmentForecast"'); await db.$executeRawUnsafe('DROP FUNCTION reject_plan_forecast()'); }
    expect(await db.installmentPlan.findUnique({ where: { expenseId: item.id } })).toBeNull(); expect(await db.installmentForecast.count({ where: { expenseId: item.id } })).toBe(0); expect(await (await request(`/expenses/${item.id}`)).json()).toEqual(item); expect(await db.expenseCommand.count({ where: { expenseId: item.id } })).toBe(1);
  });
  it('rolls back match and new purchase association when the command journal fails', async () => {
    const item = await planned(); const target = await charge(); const headers = { 'Idempotency-Key': randomUUID() }; const body = matchInput(item.version, target.id);
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_plan_command() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictitious journal failure'; END; $$`); await db.$executeRawUnsafe(`CREATE TRIGGER test_plan_command_failure BEFORE INSERT ON "ExpenseCommand" FOR EACH ROW EXECUTE FUNCTION reject_plan_command()`);
    try { expect((await request(`${path(item.id)}/matches`, body, 'POST', alice.cookie, headers)).status).toBe(500); } finally { await db.$executeRawUnsafe('DROP TRIGGER test_plan_command_failure ON "ExpenseCommand"'); await db.$executeRawUnsafe('DROP FUNCTION reject_plan_command()'); }
    expect(await (await request(`/expenses/${item.id}`)).json()).toEqual(item); expect(await db.expenseCharge.findUnique({ where: { chargeId: target.id } })).toBeNull(); expect(await db.installmentMatch.findUnique({ where: { chargeId: target.id } })).toBeNull();
    expect((await request(`${path(item.id)}/matches`, body, 'POST', alice.cookie, headers)).status).toBe(201);
  });
  it('matches subsequent CSV/OFX imports and preserves reconciliation on reimport without creating absent installments', async () => {
    const item = await planned(); const initialCount = await db.cardCharge.count(); const csvId = randomUUID(); const ofxId = randomUUID();
    const csv = `Date;Description;Amount;ID\n2026-12-08;CSV fictício;-33.35;${csvId}`;
    const template = await readFile('packages/importers/test/fixtures/card-220.ofx', 'utf8'); const entry = template.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/)![0].replace(/<FITID>[^<]+<\/FITID>/, `<FITID>${ofxId}</FITID>`).replace(/<DTPOSTED>[^<]+<\/DTPOSTED>/, '<DTPOSTED>20270108</DTPOSTED>').replace(/<TRNAMT>[^<]+<\/TRNAMT>/, '<TRNAMT>-33.33</TRNAMT>'); const ofx = template.replace(/<STMTTRN>[\s\S]*<\/STMTTRN>/, entry);
    await importFile(csv, 'csv', first.id); await importFile(ofx, 'ofx', second.id);
    const a = await db.cardCharge.findFirstOrThrow({ where: { identities: { some: { externalId: csvId } } } }); const b = await db.cardCharge.findFirstOrThrow({ where: { identities: { some: { externalId: ofxId } } } });
    const matched = await (await request(`${path(item.id)}/matches`, matchInput(item.version, a.id))).json(); const next = await (await request(`${path(item.id)}/matches`, matchInput(matched.version, b.id, { number: 2, confirmedAmount: { currency: 'BRL', cents: '3333' } }))).json();
    expect(next.installmentPlan.forecasts.map((row: any) => row.state)).toEqual(['recorded', 'recorded', 'planned']); expect(next.installmentPlan.forecasts[2].actual).toBeNull(); expect(next.description).toBe(item.description); expect(next.notes).toBe(item.notes); expect(next.facts).toEqual(item.facts);
    await importFile(csv, 'csv', first.id); await importFile(ofx, 'ofx', second.id); expect(await db.cardCharge.count()).toBe(initialCount + 2); expect(await (await request(`/expenses/${item.id}`)).json()).toEqual(next);
    expect((await db.cardCharge.findUniqueOrThrow({ where: { id: b.id } })).installment).toEqual({ state: 'unknown' });
  });
  it('persists plan/history across restart and replays unmatch after a lost response', async () => {
    const item = await planned(); const target = await charge(); const matched = await (await request(`${path(item.id)}/matches`, matchInput(item.version, target.id))).json(); const body = { expectedVersion: matched.version }; const headers = { 'Idempotency-Key': randomUUID() };
    const removed = await (await request(`${path(item.id)}/matches/1/remove`, body, 'POST', alice.cookie, headers)).json();
    await app.close(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
    expect(await (await request(`/expenses/${item.id}`)).json()).toEqual(removed); expect(await (await request(`${path(item.id)}/matches/1/remove`, body, 'POST', alice.cookie, headers)).json()).toEqual(removed);
    const history = await (await request(`/expenses/${item.id}/history`)).json(); expect(history[0].changes.previous.installmentPlan.forecasts[0].state).toBe('recorded'); expect(history[0].changes.current.installmentPlan.forecasts[0].state).toBe('planned');
  });
  it('rejects invalid calendar/float/currency/version/key and untrusted origin without leaking data', async () => {
    const item = await purchase();
    for (const overrides of [{ count: 0 }, { count: 1.5 }, { firstPeriod: '9999-12' }, { firstPeriod: '2026-13' }, { cadence: 'guessed' }, { total: { currency: 'BRL', cents: '1.5' } }, { total: { currency: 'USD', cents: '10000' } }, { userId: bob.id }, { expectedVersion: 2147483647 }]) expect((await request(path(item.id), planInput(overrides))).status).toBe(400);
    expect((await request(path(item.id), planInput(), 'POST', alice.cookie, { 'Idempotency-Key': '' })).status).toBe(400); expect((await request(path(item.id), planInput(), 'POST', alice.cookie, { Origin: 'https://attacker.test' })).status).toBe(403); expect((await request(path(item.id), planInput(), 'POST', '')).status).toBe(401);
    expect(await (await request(`/expenses/${item.id}`)).json()).toEqual(item);
  });
});
