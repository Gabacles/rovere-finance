import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { ImportWorker } from '../src/imports/worker.js';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { mailLink } from '../../../scripts/test-mail.mjs';

const origin = 'http://127.0.0.1:18080'; let database: Awaited<ReturnType<typeof testDatabase>>; let db: ReturnType<typeof createDatabase>; let app: Awaited<ReturnType<typeof createApp>>; let base: string;
let alice: { id: string; cookie: string }; let bob: typeof alice; let credit: { id: string }; let periodIndex = 0;
const config = () => ({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: origin, smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false, importsWorkerEnabled: false });
function request(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', cookie = alice?.cookie ?? '', extra = {}) { return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
async function register(label: string) {
  const email = `${label}-${randomUUID()}@rovere.test`; const password = 'Fictitious-calculation-123!'; const signup = await request('/auth/sign-up/email', { name: label, email, password }); expect(signup.status).toBe(200); const user = (await signup.json()).user;
  const url = new URL(await mailLink(email, 'Confirme')); await fetch(`${base}${url.pathname}${url.search}`, { redirect: 'manual' }); const login = await request('/auth/sign-in/email', { email, password }); expect(login.status).toBe(200); return { id: user.id, cookie: login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
async function statement() { const index = periodIndex++; return db.statement.create({ data: { userId: alice.id, creditAccountId: credit.id, period: `${2026 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`, creationKey: randomUUID() } }); }
const path = (id: string) => `/credit-accounts/${credit.id}/statements/${id}`;
async function summary(id: string) { const response = await request(`${path(id)}/summary`); expect(response.status).toBe(200); return response.json(); }
async function line(statementId: string, cents = '-10000', description = 'Pagamento Pix fictício') { return db.cardCharge.create({ data: { userId: alice.id, creditAccountId: credit.id, statementId, postedOn: new Date('2025-12-31T00:00:00Z'), description, cents: BigInt(cents), fingerprint: randomUUID().replaceAll('-', '').padEnd(64, '0'), installment: { state: 'unknown' } } }); }
const input = (nature: string, cents: string, expectedVersion = 0) => ({ expectedVersion, classification: { nature, amount: { currency: 'BRL', cents } } });
async function classify(id: string, nature: string, cents: string, expectedVersion = 0) { const response = await request(`/card-charges/${id}/classification`, input(nature, cents, expectedVersion), 'PATCH'); expect(response.status).toBe(200); return response.json(); }
async function coverage(id: string, facts: unknown = { coverage: 'complete' }) { const current = await (await request(path(id))).json(); const response = await request(path(id), { expectedVersion: current.version, facts }, 'PATCH'); expect(response.status).toBe(200); return response.json(); }
async function importFile(text: string, format: 'csv' | 'ofx', statementId: string) {
  const form = new FormData(); form.append('format', format); form.append('configuration', JSON.stringify(format === 'ofx' ? {} : { profile: { id: 'calculation-fixture', encoding: 'utf-8', delimiter: ';', headerLine: 1, dateFormat: 'YMD', decimal: '.', grouping: null, sign: 'as-is', currency: 'BRL', kind: 'card', columns: { date: 'Date', description: 'Description', amount: 'Amount', externalId: 'ID' } } }));
  form.append('file', new Blob([text]), `fictitious.${format}`); const uploaded = await fetch(`${base}/api/imports`, { method: 'POST', headers: { Origin: origin, Cookie: alice.cookie, 'Idempotency-Key': randomUUID() }, body: form }); expect(uploaded.status).toBe(201); const batch = await uploaded.json(); await app.get(ImportWorker).runOnce(); const current = await (await request(`/imports/${batch.id}`)).json();
  const saved = await (await request(`/imports/${batch.id}/review`, { expectedVersion: current.version, blocks: [{ id: current.blocks[0].id, creditAccountId: credit.id, statementId }] }, 'PATCH')).json(); expect((await request(`/imports/${batch.id}/confirm`, { expectedVersion: saved.version })).status).toBe(201);
}
beforeAll(async () => { database = await testDatabase(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); alice = await register('Alice'); bob = await register('Bob'); credit = await (await request('/credit-accounts', { name: 'Crédito fictício' })).json(); });
afterAll(async () => { await app?.close(); await database?.close(); });

describe('RF-023 explicit nature, coverage and statement calculations', () => {
  it('keeps empty and unclassified totals incomplete, including descriptions/signs that look like payments', async () => {
    const stmt = await statement(); expect(await summary(stmt.id)).toMatchObject({ recordCount: 0, calculatedTotal: { state: 'incomplete' }, knownSubtotal: { amount: { cents: '0' } }, comparison: 'unknown' });
    const row = await line(stmt.id); const value = await (await request(`/card-charges/${row.id}`)).json(); expect(value).toMatchObject({ version: 0, classification: { state: 'unknown' }, amount: { cents: '-10000' } }); expect((await summary(stmt.id)).unclassifiedCount).toBe(1);
    await coverage(stmt.id); expect((await summary(stmt.id)).calculatedTotal).toMatchObject({ state: 'incomplete', reasons: ['UNCLASSIFIED_LINES'] });
    const empty = await statement(); await coverage(empty.id, { coverage: 'complete', declaredTotal: { currency: 'BRL', cents: '0' } }); expect(await summary(empty.id)).toMatchObject({ calculatedTotal: { amount: { cents: '0' } }, comparison: 'equal' });
  });
  it('calculates explicit kinds separately, before payment allocations, without affecting cash or original facts', async () => {
    const stmt = await statement(); for (const [nature, cents] of [['purchase', '10000'], ['fee', '200'], ['interest', '100'], ['previous_balance', '6000'], ['other_debit', '400'], ['refund', '1000'], ['other_credit', '500'], ['payment', '9000'], ['informational', '99999']]) { const row = await line(stmt.id, `-${cents}`); const result = await classify(row.id, nature!, cents!); expect(result.amount.cents).toBe(`-${cents}`); expect(result.postedOn).toBe('2025-12-31'); }
    await coverage(stmt.id, { coverage: 'complete', declaredTotal: { currency: 'BRL', cents: '15200' }, cycle: 'closed' }); const value = await summary(stmt.id);
    expect(value).toMatchObject({ consumptionGross: { amount: { cents: '10300' } }, reportedPayments: { amount: { cents: '9000' } }, calculatedTotal: { amount: { cents: '15200' } }, comparison: 'equal', difference: { amount: { cents: '0' } } }); expect(value).not.toHaveProperty('paid'); expect(value).not.toHaveProperty('balance'); expect(await db.bankEntry.count()).toBe(0);
    const history = await (await request(`${path(stmt.id)}/history`)).json(); expect(history[0].changes.coverageSnapshot).toHaveLength(9); expect(history[0].changes.coverageHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('replays original classification after later correction and rejects concurrent stale writes', async () => {
    const stmt = await statement(); const row = await line(stmt.id); const body = input('purchase', '10000'); const headers = { 'Idempotency-Key': randomUUID() };
    const responses = await Promise.all([request(`/card-charges/${row.id}/classification`, body, 'PATCH', alice.cookie, headers), request(`/card-charges/${row.id}/classification`, body, 'PATCH', alice.cookie, headers)]); expect(responses.map(value => value.status)).toEqual([200, 200]); const original = await responses[0]!.json(); expect(await responses[1]!.json()).toEqual(original);
    await classify(row.id, 'fee', '10000', 1); expect(await (await request(`/card-charges/${row.id}/classification`, body, 'PATCH', alice.cookie, headers)).json()).toEqual(original); expect((await request(`/card-charges/${row.id}/classification`, input('fee', '10000'), 'PATCH', alice.cookie, headers)).status).toBe(409);
    const competing = await Promise.all(['purchase', 'payment'].map(nature => request(`/card-charges/${row.id}/classification`, input(nature, '10000', 2), 'PATCH'))); expect(competing.map(value => value.status).sort()).toEqual([200, 409]); expect(await db.cardChargeCommand.count({ where: { chargeId: row.id } })).toBe(3);
  });
  it('invalidates current coverage after classification changes, preserves its declaration and supports reconfirm/clear', async () => {
    const stmt = await statement(); const row = await line(stmt.id); await classify(row.id, 'purchase', '10000'); const saved = await coverage(stmt.id, { coverage: 'complete', declaredTotal: { currency: 'BRL', cents: '9999' } }); expect((await summary(stmt.id)).comparison).toBe('different');
    await classify(row.id, 'fee', '10000', 1); const stale = await summary(stmt.id); expect(stale.facts.coverage).toEqual(saved.facts.coverage); expect(stale.calculatedTotal).toMatchObject({ state: 'incomplete', reasons: ['COVERAGE_STALE'] }); expect(stale.difference.state).toBe('unknown');
    await coverage(stmt.id); expect((await summary(stmt.id)).difference.amount.cents).toBe('-1'); const originalProof = (await summary(stmt.id)).facts.coverage;
    await coverage(stmt.id, { dueOn: '2027-01-01' }); expect((await summary(stmt.id)).facts.coverage).toEqual(originalProof); expect((await summary(stmt.id)).coverageCurrent).toBe(true);
    await coverage(stmt.id, { coverage: 'partial' }); expect((await summary(stmt.id)).calculatedTotal.state).toBe('incomplete'); await coverage(stmt.id, { coverage: null }); expect((await summary(stmt.id)).facts.coverage.state).toBe('unknown');
  });
  it('preserves classifications and coverage on CSV/OFX reimport and flags new lines as incomplete', async () => {
    const stmt = await statement(); const csvId = randomUUID(); const ofxId = randomUUID(); const csv = `Date;Description;Amount;ID\n2026-10-08;Pix fatura fictício;-12.34;${csvId}`;
    const template = await readFile('packages/importers/test/fixtures/card-220.ofx', 'utf8'); const entry = template.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/)![0].replace(/<FITID>[^<]+<\/FITID>/, `<FITID>${ofxId}</FITID>`).replace(/<TRNAMT>[^<]+<\/TRNAMT>/, '<TRNAMT>-12.34</TRNAMT>'); const ofx = template.replace(/<STMTTRN>[\s\S]*<\/STMTTRN>/, entry);
    for (const [text, format] of [[csv, 'csv'], [ofx, 'ofx']] as const) await importFile(text, format, stmt.id);
    const rows = await db.cardCharge.findMany({ where: { statementId: stmt.id } }); expect(rows).toHaveLength(2); expect(rows.every(row => row.classificationKind === null)).toBe(true); for (const row of rows) await classify(row.id, 'purchase', '1234');
    await coverage(stmt.id, { coverage: 'complete', cycle: 'closed' }); const before = await summary(stmt.id); for (const [text, format] of [[csv, 'csv'], [ofx, 'ofx']] as const) await importFile(text, format, stmt.id); expect(await summary(stmt.id)).toEqual(before);
    await importFile(`Date;Description;Amount;ID\n2026-10-08;Nova linha;-1.00;${randomUUID()}`, 'csv', stmt.id); const changed = await summary(stmt.id); expect(changed.facts.coverage).toEqual(before.facts.coverage); expect(changed.facts.cycle.value).toBe('closed'); expect(changed.calculatedTotal).toMatchObject({ state: 'incomplete', reasons: ['UNCLASSIFIED_LINES', 'COVERAGE_STALE'] }); expect(changed.recordCount).toBe(3);
  });
  it('excludes purchase aggregate/forecasts and bank entries, protecting both directions of installment dependencies', async () => {
    const stmt = await statement(); const row = await line(stmt.id, '-3335'); await classify(row.id, 'refund', '3335');
    const expense = await (await request('/expenses', { description: 'Compra fictícia', facts: { total: { currency: 'BRL', cents: '3335' } } })).json(); const plan = await (await request(`/expenses/${expense.id}/installment-plan`, { expectedVersion: 0, total: { currency: 'BRL', cents: '3335' }, count: 1, creditAccountId: credit.id, firstPeriod: stmt.period, cadence: 'monthly' })).json();
    const match = { expectedVersion: plan.version, number: 1, chargeId: row.id, confirmedAmount: { currency: 'BRL', cents: '3335' } }; expect((await request(`/expenses/${expense.id}/installment-plan/matches`, match)).status).toBe(409);
    expect((await request(`/card-charges/${row.id}/classification`, { expectedVersion: 1, classification: null }, 'PATCH')).status).toBe(200); expect((await request(`/expenses/${expense.id}/installment-plan/matches`, match)).status).toBe(201);
    expect((await request(`/card-charges/${row.id}/classification`, input('payment', '3335', 2), 'PATCH')).status).toBe(409); await classify(row.id, 'purchase', '3335', 2);
    const account = await (await request('/accounts', { name: 'Banco fictício' })).json(); await db.bankEntry.create({ data: { userId: alice.id, accountId: account.id, postedOn: new Date('2027-02-01T00:00:00Z'), description: 'Caixa fictício', cents: -3335n, fingerprint: 'a'.repeat(64) } });
    await coverage(stmt.id); const value = await summary(stmt.id); expect(value.calculatedTotal.amount.cents).toBe('3335'); expect(value.recordCount).toBe(1); expect(await db.bankEntry.count()).toBe(1); expect(value.facts.coverage.state).toBe('confirmed');
  });
  it('isolates classification/summary/history APIs and composite journal ownership between users/credits', async () => {
    const stmt = await statement(); const row = await line(stmt.id); for (const suffix of ['', '/history']) expect((await request(`/card-charges/${row.id}${suffix}`, undefined, 'GET', bob.cookie)).status).toBe(404);
    expect((await request(`/card-charges/${row.id}/classification`, input('purchase', '10000'), 'PATCH', bob.cookie)).status).toBe(404); expect((await request(`${path(stmt.id)}/summary`, undefined, 'GET', bob.cookie)).status).toBe(404);
    const other = await (await request('/credit-accounts', { name: 'Outro crédito' })).json(); expect((await request(`/credit-accounts/${other.id}/statements/${stmt.id}/summary`)).status).toBe(404);
    await expect(db.cardChargeCommand.create({ data: { userId: bob.id, creditAccountId: credit.id, chargeId: row.id, key: randomUUID(), requestHash: 'a'.repeat(64), version: 1, changes: {}, result: {} } })).rejects.toThrow(); expect((await request(`${path(stmt.id)}/summary`, undefined, 'GET', '')).status).toBe(401);
  });
  it('rolls back classification if its journal fails and coverage if its history fails', async () => {
    const stmt = await statement(); const row = await line(stmt.id); await db.$executeRawUnsafe(`CREATE FUNCTION reject_card_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictitious failure'; END; $$`); await db.$executeRawUnsafe(`CREATE TRIGGER test_card_journal_failure BEFORE INSERT ON "CardChargeCommand" FOR EACH ROW EXECUTE FUNCTION reject_card_journal()`);
    try { expect((await request(`/card-charges/${row.id}/classification`, input('purchase', '10000'), 'PATCH')).status).toBe(500); } finally { await db.$executeRawUnsafe('DROP TRIGGER test_card_journal_failure ON "CardChargeCommand"'); await db.$executeRawUnsafe('DROP FUNCTION reject_card_journal()'); }
    expect((await (await request(`/card-charges/${row.id}`)).json()).classification.state).toBe('unknown'); expect(await db.cardChargeCommand.count({ where: { chargeId: row.id } })).toBe(0);
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_coverage_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictitious failure'; END; $$`); await db.$executeRawUnsafe(`CREATE TRIGGER test_coverage_failure BEFORE INSERT ON "StatementFactChange" FOR EACH ROW EXECUTE FUNCTION reject_coverage_history()`);
    try { expect((await request(path(stmt.id), { expectedVersion: 0, facts: { coverage: 'complete' } }, 'PATCH')).status).toBe(500); } finally { await db.$executeRawUnsafe('DROP TRIGGER test_coverage_failure ON "StatementFactChange"'); await db.$executeRawUnsafe('DROP FUNCTION reject_coverage_history()'); }
    expect(await db.statement.findUniqueOrThrow({ where: { id: stmt.id } })).toMatchObject({ version: 0, coverage: null, coverageHash: null });
  });
  it('clears explicitly with immutable history and persists/replays across application restart', async () => {
    const stmt = await statement(); const row = await line(stmt.id); await classify(row.id, 'purchase', '10000'); const body = { expectedVersion: 1, classification: null }; const headers = { 'Idempotency-Key': randomUUID() }; const response = await request(`/card-charges/${row.id}/classification`, body, 'PATCH', alice.cookie, headers); const cleared = await response.json(); expect(cleared.classification.state).toBe('unknown');
    const history = await (await request(`/card-charges/${row.id}/history`)).json(); expect(history.map((value: any) => value.version)).toEqual([2, 1]); expect(history[0].changes.previous.classification.value.nature).toBe('purchase'); await expect(db.cardChargeCommand.update({ where: { id: history[0].id }, data: { version: 10 } })).rejects.toThrow(); await expect(db.cardChargeCommand.delete({ where: { id: history[0].id } })).rejects.toThrow();
    await app.close(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); expect(await (await request(`/card-charges/${row.id}/classification`, body, 'PATCH', alice.cookie, headers)).json()).toEqual(cleared);
  });
  it('reports aggregate overflow and rejects invalid input, incomplete SQL metadata and leaked JSON', async () => {
    const stmt = await statement(); for (const cents of ['9223372036854775807', '1']) { const row = await line(stmt.id, `-${cents}`); await classify(row.id, 'purchase', cents); } await coverage(stmt.id); expect((await summary(stmt.id)).calculatedTotal.state).toBe('overflow');
    const row = await line(stmt.id); for (const body of [input('guess', '10000'), input('purchase', '-10000'), input('purchase', '9999'), { ...input('purchase', '10000'), userId: bob.id }, { ...input('purchase', '10000'), expectedVersion: 2147483647 }]) expect((await request(`/card-charges/${row.id}/classification`, body, 'PATCH')).status).toBe(400);
    expect((await request(`/card-charges/${row.id}/classification`, input('purchase', '10000'), 'PATCH', alice.cookie, { Origin: 'https://attacker.test' })).status).toBe(403); expect((await request(`/card-charges/${row.id}/classification`, input('purchase', '10000'), 'PATCH', alice.cookie, { 'Idempotency-Key': '' })).status).toBe(400);
    const malformed = await fetch(`${base}/api/card-charges/${row.id}/classification`, { method: 'PATCH', headers: { Origin: origin, Cookie: alice.cookie, 'Content-Type': 'application/json' }, body: '{"private":"fictitious-sensitive-value"' }); expect(malformed.status).toBe(400); expect(await malformed.text()).not.toContain('fictitious-sensitive-value');
    await expect(db.cardCharge.update({ where: { id: row.id }, data: { classifiedCents: 10000n } })).rejects.toThrow(); await expect(db.statement.update({ where: { id: stmt.id }, data: { coverage: null } })).rejects.toThrow();
  });
});
