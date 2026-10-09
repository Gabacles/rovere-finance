import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { ImportWorker } from '../src/imports/worker.js';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { mailLink } from '../../../scripts/test-mail.mjs';

const origin = 'http://127.0.0.1:18080';
let database: Awaited<ReturnType<typeof testDatabase>>; let db: ReturnType<typeof createDatabase>; let app: Awaited<ReturnType<typeof createApp>>; let base: string;
let alice: { id: string; cookie: string }; let bob: typeof alice; let credit: { id: string }; let statement: { id: string };
const config = () => ({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: origin,
  smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false, importsWorkerEnabled: false });
function request(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', cookie = alice?.cookie ?? '', extra = {}) {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
}
async function register(label: string) {
  const email = `${label}-${randomUUID()}@rovere.test`; const password = 'Fictitious-purchase-123!';
  const signup = await request('/auth/sign-up/email', { name: label, email, password }); expect(signup.status).toBe(200); const user = (await signup.json()).user;
  const url = new URL(await mailLink(email, 'Confirme')); await fetch(`${base}${url.pathname}${url.search}`, { redirect: 'manual' });
  const login = await request('/auth/sign-in/email', { email, password }); expect(login.status).toBe(200);
  return { id: user.id, cookie: login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
async function purchase(description = 'Compra fictícia') { const response = await request('/expenses', { description, notes: 'Nota manual' }); expect(response.status).toBe(201); return response.json(); }
async function charge(owner = alice, targetCredit = credit, targetStatement = statement) {
  return db.cardCharge.create({ data: { userId: owner.id, creditAccountId: targetCredit.id, statementId: targetStatement.id, postedOn: new Date('2026-10-08T00:00:00Z'), description: 'Cobrança fictícia', cents: -12000n, fingerprint: randomUUID().replaceAll('-', '').padEnd(64, '0'), installment: { state: 'unknown' } } });
}
async function importCharge() {
  const form = new FormData(); form.append('format', 'csv'); form.append('configuration', JSON.stringify({ profile: { id: 'purchase-test', encoding: 'utf-8', delimiter: ';', headerLine: 1, dateFormat: 'YMD', decimal: '.', grouping: null, sign: 'as-is', currency: 'BRL', kind: 'card', columns: { date: 'Date', description: 'Description', amount: 'Amount', externalId: 'ID', installmentNumber: 'Number', installmentTotal: 'Count' } } }));
  form.append('file', new Blob(['Date;Description;Amount;ID;Number;Count\n2026-10-08;Source description;-120.00;purchase-3-of-10;3;10']), 'purchase.csv');
  const uploaded = await fetch(`${base}/api/imports`, { method: 'POST', headers: { Origin: origin, Cookie: alice.cookie, 'Idempotency-Key': randomUUID() }, body: form }); expect(uploaded.status).toBe(201);
  const batch = await uploaded.json(); await app.get(ImportWorker).runOnce(); const current = await (await request(`/imports/${batch.id}`)).json();
  const saved = await (await request(`/imports/${batch.id}/review`, { expectedVersion: current.version, blocks: [{ id: current.blocks[0].id, creditAccountId: credit.id, statementId: statement.id }] }, 'PATCH')).json();
  const confirmed = await request(`/imports/${batch.id}/confirm`, { expectedVersion: saved.version }); expect(confirmed.status).toBe(201); return confirmed.json();
}
beforeAll(async () => {
  database = await testDatabase(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  alice = await register('Alice'); bob = await register('Bob');
  credit = await (await request('/credit-accounts', { name: 'Crédito fictício' })).json(); statement = await (await request(`/credit-accounts/${credit.id}/statements`, { period: '2026-10' })).json();
});
afterAll(async () => { await app?.close(); await database?.close(); });

describe('RF-021 manual purchases and typed charge associations', () => {
  it('creates partial/complete facts and zero without any financial movement', async () => {
    const partial = await purchase(); expect(partial).toMatchObject({ version: 0, knowledge: 'partial', facts: { purchasedOn: { state: 'unknown' }, total: { state: 'unknown' } }, charges: [] });
    const response = await request('/expenses', { description: 'Zero explícito', facts: { purchasedOn: '2024-02-29', total: { currency: 'BRL', cents: '0' } } }); expect(response.status).toBe(201);
    const complete = await response.json(); expect(complete.knowledge).toBe('complete'); expect(complete.facts.total).toMatchObject({ state: 'confirmed', value: { cents: '0' }, evidence: { kind: 'user' } });
    expect(await db.cardCharge.count()).toBe(0); expect(await db.bankEntry.count()).toBe(0); expect(await db.expenseCommand.count()).toBe(2);
  });
  it('replays concurrent creates and the original response after subsequent edits', async () => {
    const key = randomUUID(); const body = { description: 'Resposta perdida' }; const headers = { 'Idempotency-Key': key };
    const responses = await Promise.all([request('/expenses', body, 'POST', alice.cookie, headers), request('/expenses', body, 'POST', alice.cookie, headers)]);
    expect(responses.map(value => value.status)).toEqual([201, 201]); const first = await responses[0]!.json(); expect(await responses[1]!.json()).toEqual(first);
    expect((await request(`/expenses/${first.id}`, { expectedVersion: 0, description: 'Corrigida' }, 'PATCH')).status).toBe(200);
    expect(await (await request('/expenses', body, 'POST', alice.cookie, headers)).json()).toEqual(first);
    expect((await request('/expenses', { description: 'Outra' }, 'POST', alice.cookie, headers)).status).toBe(409);
    expect((await request('/expenses', body, 'POST', bob.cookie, headers)).status).toBe(201);
    expect(await db.expense.count({ where: { userId: alice.id, description: 'Corrigida' } })).toBe(1);
  });
  it('links a later import without inventing total/date/previous installments or duplicating on reimport', async () => {
    const manual = await purchase('Descrição manual preservada'); const before = await db.cardCharge.count();
    await importCharge(); const imported = await db.cardCharge.findFirstOrThrow({ where: { identities: { some: { externalId: 'purchase-3-of-10' } } } });
    await db.cardCharge.update({ where: { id: imported.id }, data: { notes: 'Correção manual na cobrança' } });
    const body = { expectedVersion: 0, association: { action: 'link', chargeId: imported.id } }; const headers = { 'Idempotency-Key': randomUUID() };
    const result = await request(`/expenses/${manual.id}`, body, 'PATCH', alice.cookie, headers); expect(result.status).toBe(200); const linked = await result.json();
    expect(linked.description).toBe(manual.description); expect(linked.notes).toBe(manual.notes); expect(linked.facts).toEqual(manual.facts); expect(linked.knowledge).toBe('partial');
    expect(linked.charges[0]).toMatchObject({ id: imported.id, amount: { cents: '-12000' }, installment: { state: 'confirmed', value: { number: 3, total: { state: 'confirmed', value: 10 } } } });
    expect(await (await request(`/expenses/${manual.id}`, body, 'PATCH', alice.cookie, headers)).json()).toEqual(linked);
    await importCharge(); expect(await db.cardCharge.count()).toBe(before + 1); expect(await db.expenseCharge.count({ where: { expenseId: manual.id } })).toBe(1);
    expect(await (await request(`/expenses/${manual.id}`)).json()).toEqual(linked);
    const entries = await (await request(`/entries?kind=card&accountId=${credit.id}`)).json(); expect(entries.rows.find((row: any) => row.id === imported.id).expenseId).toBe(manual.id);
  });
  it('serializes competing purchases for one charge and rolls back the losing metadata edit', async () => {
    const a = await purchase('A'); const b = await purchase('B'); const target = await charge();
    const responses = await Promise.all([a, b].map(item => request(`/expenses/${item.id}`, { expectedVersion: 0, description: 'Winner', association: { action: 'link', chargeId: target.id } }, 'PATCH')));
    expect(responses.map(value => value.status).sort()).toEqual([200, 409]);
    const loser = responses[0]!.status === 409 ? a : b;
    expect(await (await request(`/expenses/${loser.id}`)).json()).toEqual(loser); expect(await db.expenseCharge.count({ where: { chargeId: target.id } })).toBe(1);
    expect(await db.expenseCommand.count({ where: { expenseId: loser.id } })).toBe(1);
  });
  it('rejects stale concurrent versions and preserves confirmed data until explicitly cleared', async () => {
    const item = await purchase(); const responses = await Promise.all(['10001', '10002'].map(cents => request(`/expenses/${item.id}`, { expectedVersion: 0, facts: { total: { currency: 'BRL', cents } } }, 'PATCH')));
    expect(responses.map(value => value.status).sort()).toEqual([200, 409]); const current = await (await request(`/expenses/${item.id}`)).json();
    const next = await (await request(`/expenses/${item.id}`, { expectedVersion: 1, facts: { purchasedOn: '2026-09-01' } }, 'PATCH')).json(); expect(next.knowledge).toBe('complete'); expect(next.facts.total).toEqual(current.facts.total);
    const cleared = await (await request(`/expenses/${item.id}`, { expectedVersion: 2, facts: { total: null } }, 'PATCH')).json(); expect(cleared.knowledge).toBe('partial'); expect(cleared.facts.purchasedOn).toEqual(next.facts.purchasedOn);
    const history = await (await request(`/expenses/${item.id}/history`)).json(); expect(history.map((row: any) => row.version)).toEqual([3, 2, 1, 0]); expect(history[0].changes.previous.facts.total).toEqual(next.facts.total);
    await expect(db.expenseCommand.update({ where: { id: history[0].id }, data: { version: 5 } })).rejects.toThrow();
    await expect(db.expenseCommand.delete({ where: { id: history[0].id } })).rejects.toThrow();
  });
  it('isolates API reads/writes and composite SQL associations across owners', async () => {
    const item = await purchase(); const otherCredit = await (await request('/credit-accounts', { name: 'Bob' }, 'POST', bob.cookie)).json();
    const otherStatement = await (await request(`/credit-accounts/${otherCredit.id}/statements`, { period: '2026-10' }, 'POST', bob.cookie)).json(); const foreign = await charge(bob, otherCredit, otherStatement);
    for (const suffix of ['', '/history']) expect((await request(`/expenses/${item.id}${suffix}`, undefined, 'GET', bob.cookie)).status).toBe(404);
    expect((await request(`/expenses/${item.id}`, { expectedVersion: 0, description: 'Foreign' }, 'PATCH', bob.cookie)).status).toBe(404);
    expect((await request(`/expenses/${item.id}`, { expectedVersion: 0, association: { action: 'link', chargeId: foreign.id } }, 'PATCH')).status).toBe(404);
    await expect(db.expenseCharge.create({ data: { userId: alice.id, expenseId: item.id, chargeId: foreign.id } })).rejects.toThrow();
    expect(await (await request(`/expenses/${item.id}`)).json()).toEqual(item);
    expect((await (await request('/expenses', undefined, 'GET', bob.cookie)).json()).rows.every((row: any) => row.id !== item.id)).toBe(true);
    expect((await request('/expenses', undefined, 'GET', '')).status).toBe(401);
  });
  it('rolls back both creation and association if the immutable command cannot be recorded', async () => {
    const item = await purchase(); const target = await charge(); const count = await db.expense.count();
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_expense_command() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictitious journal failure'; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER test_expense_command_failure BEFORE INSERT ON "ExpenseCommand" FOR EACH ROW EXECUTE FUNCTION reject_expense_command()`);
    try {
      expect((await request('/expenses', { description: 'Rollback' })).status).toBe(500);
      expect((await request(`/expenses/${item.id}`, { expectedVersion: 0, description: 'Rollback', association: { action: 'link', chargeId: target.id } }, 'PATCH')).status).toBe(500);
    } finally { await db.$executeRawUnsafe('DROP TRIGGER test_expense_command_failure ON "ExpenseCommand"'); await db.$executeRawUnsafe('DROP FUNCTION reject_expense_command()'); }
    expect(await db.expense.count()).toBe(count); expect(await db.expenseCharge.findUnique({ where: { chargeId: target.id } })).toBeNull(); expect(await (await request(`/expenses/${item.id}`)).json()).toEqual(item);
  });
  it('unlinks explicitly, preserving charge/source and replaying the unlink after restart', async () => {
    const item = await purchase(); const target = await charge(); const linked = await (await request(`/expenses/${item.id}`, { expectedVersion: 0, association: { action: 'link', chargeId: target.id } }, 'PATCH')).json();
    const key = randomUUID(); const body = { expectedVersion: linked.version, association: { action: 'unlink', chargeId: target.id } }; const headers = { 'Idempotency-Key': key };
    const unlinked = await (await request(`/expenses/${item.id}`, body, 'PATCH', alice.cookie, headers)).json(); expect(unlinked.charges).toEqual([]); expect(await db.cardCharge.findUniqueOrThrow({ where: { id: target.id } })).toEqual(target);
    await app.close(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
    expect(await (await request(`/expenses/${item.id}`, body, 'PATCH', alice.cookie, headers)).json()).toEqual(unlinked);
    expect((await request(`/expenses/${item.id}`, { ...body, expectedVersion: unlinked.version }, 'PATCH')).status).toBe(409);
  });
  it('validates payloads/origin/keys and redacts malformed JSON while guarding the SQL model', async () => {
    for (const body of [{ description: 'Invalid', facts: { total: { currency: 'BRL', cents: '-1' } } }, { description: 'Invalid', facts: { purchasedOn: '2026-02-30' } }, { description: 'Invalid', userId: bob.id }]) expect((await request('/expenses', body)).status).toBe(400);
    expect((await request('/expenses', { description: 'Missing key' }, 'POST', alice.cookie, { 'Idempotency-Key': '' })).status).toBe(400);
    expect((await request('/expenses', { description: 'Origin' }, 'POST', alice.cookie, { Origin: 'https://attacker.test' })).status).toBe(403);
    const malformed = await fetch(`${base}/api/expenses`, { method: 'POST', headers: { Origin: origin, Cookie: alice.cookie, 'Content-Type': 'application/json' }, body: '{"total":"fictitious-private-value"' }); expect(malformed.status).toBe(400); expect(await malformed.text()).not.toContain('fictitious-private-value');
    await expect(db.expense.create({ data: { userId: alice.id, description: 'Invalid SQL', total: -1n } })).rejects.toThrow();
    await expect(db.expense.create({ data: { userId: alice.id, description: 'Missing evidence', total: 0n } })).rejects.toThrow();
  });
  it('paginates all purchases without exposing another owner or computing financial totals', async () => {
    for (let index = 0; index < 26; index++) await purchase(`Página fictícia ${index}`);
    const first = await (await request('/expenses?page=1')).json(); const second = await (await request('/expenses?page=2')).json(); expect(first.rows).toHaveLength(25); expect(second.rows.length).toBeGreaterThan(0);
    expect(first.total).toBe(await db.expense.count({ where: { userId: alice.id } })); expect(first).not.toHaveProperty('totalCents'); expect(new Set([...first.rows, ...second.rows].map(row => row.id)).size).toBe(first.rows.length + second.rows.length);
    expect((await request('/expenses?page=0')).status).toBe(400);
  });
});
