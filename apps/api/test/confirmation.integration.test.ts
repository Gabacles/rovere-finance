import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { ImportWorker } from '../src/imports/worker.js';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { mailLink } from '../../../scripts/test-mail.mjs';

const origin = 'http://127.0.0.1:18080';
let database: Awaited<ReturnType<typeof testDatabase>>; let db: ReturnType<typeof createDatabase>;
let app: Awaited<ReturnType<typeof createApp>>; let base: string; let worker: ImportWorker;
let alice: { id: string; cookie: string }; let bob: typeof alice;
let bank: { id: string }; let bobBank: typeof bank; let credit: typeof bank; let bobCredit: typeof bank; let statement: typeof bank; let bobStatement: typeof bank;
const profile = (external = true) => ({ id: 'generic-v1', encoding: 'utf-8', delimiter: ';', headerLine: 1, dateFormat: 'YMD', decimal: '.', grouping: null,
  sign: 'as-is', currency: 'BRL', kind: 'card', columns: { date: 'Date', description: 'Description', amount: 'Amount', ...(external ? { externalId: 'ID' } : {}) } });
const csv = (count = 1, offset = 0) => 'Date;Description;Amount;ID\n' + Array.from({ length: count }, (_, i) => `2026-10-08;Fictitious ${i + offset};-12.34;${String(i + offset).padStart(4, '0')}`).join('\n');
function request(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', cookie = alice?.cookie ?? '', token = randomUUID()) {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie, 'Idempotency-Key': token },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
}
async function register(label: string) {
  const email = `${label}-${randomUUID()}@rovere.test`; const password = 'Fictitious-confirmation-123!';
  const signup = await request('/auth/sign-up/email', { name: label, email, password }); expect(signup.status).toBe(200); const user = (await signup.json()).user;
  const url = new URL(await mailLink(email, 'Confirme')); await fetch(`${base}${url.pathname}${url.search}`, { redirect: 'manual' });
  const login = await request('/auth/sign-in/email', { email, password }); expect(login.status).toBe(200);
  return { id: user.id, cookie: login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
async function prepare(text = csv(), format = 'csv', config: unknown = { profile: profile() }, cookie = alice.cookie, target: Record<string, string> = { creditAccountId: credit.id, statementId: statement.id }) {
  const form = new FormData(); form.append('format', format); form.append('configuration', JSON.stringify(config)); form.append('file', new Blob([text]), `fictitious-${randomUUID()}.${format}`);
  const response = await fetch(`${base}/api/imports`, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Idempotency-Key': randomUUID() }, body: form });
  expect(response.status).toBe(201); const uploaded = await response.json(); expect(await worker.runOnce()).toBe(true);
  const batch = await (await request(`/imports/${uploaded.id}`, undefined, 'GET', cookie)).json(); expect(batch.status).toBe('review');
  const patched = await request(`/imports/${batch.id}/review`, { expectedVersion: batch.version, blocks: batch.blocks.map((block: { id: string }) => ({ id: block.id, ...target })) }, 'PATCH', cookie);
  expect(patched.status).toBe(200); return { id: batch.id, version: (await patched.json()).version };
}
function confirm(batch: { id: string; version: number }, token = randomUUID(), cookie = alice.cookie) { return request(`/imports/${batch.id}/confirm`, { expectedVersion: batch.version }, 'POST', cookie, token); }
async function preview(batch: { id: string }) { return (await request(`/imports/${batch.id}/confirmation-preview`)).json(); }
async function rows(batch: { id: string }) { return (await request(`/imports/${batch.id}/rows`)).json(); }
const config = () => ({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: origin,
  smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false, importsWorkerEnabled: false });
beforeAll(async () => {
  database = await testDatabase(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); worker = app.get(ImportWorker);
  alice = await register('Alice'); bob = await register('Bob');
  bank = await (await request('/accounts', { name: 'Banco Alice' })).json(); bobBank = await (await request('/accounts', { name: 'Banco Bob' }, 'POST', bob.cookie)).json();
  credit = await (await request('/credit-accounts', { name: 'Crédito Alice' })).json(); bobCredit = await (await request('/credit-accounts', { name: 'Crédito Bob' }, 'POST', bob.cookie)).json();
  statement = await (await request(`/credit-accounts/${credit.id}/statements`, { period: '2026-10' })).json(); bobStatement = await (await request(`/credit-accounts/${bobCredit.id}/statements`, { period: '2026-10' }, 'POST', bob.cookie)).json();
});
beforeEach(async () => {
  // Only this suite's isolated rovere_test schema; never development data.
  await db.importOutcome.deleteMany(); await db.importConfirmation.deleteMany(); await db.importRow.deleteMany(); await db.importBatch.deleteMany();
  await db.bankExternalIdentity.deleteMany(); await db.cardExternalIdentity.deleteMany(); await db.bankEntry.deleteMany(); await db.cardCharge.deleteMany();
});
afterAll(async () => { await app?.close(); await database?.close(); });

describe('RF-018 transactional confirmation', () => {
  it('confirms and reimports 500 purchases in CSV and OFX with exact values and provenance', async () => {
    const template = await readFile('packages/importers/test/fixtures/card-220.ofx', 'utf8'); const first = template.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/)![0];
    const ofx = template.replace(/<STMTTRN>[\s\S]*<\/STMTTRN>/, Array.from({ length: 500 }, (_, i) => first.replace(/<FITID>[^<]+<\/FITID>/, `<FITID>ofx-${i}</FITID>`).replace('Loja &amp; Café fictícios', `OFX fictitious ${i}`)).join(''));
    for (const [text, format, settings] of [[csv(500), 'csv', { profile: profile() }], [ofx, 'ofx', {}]] as const) {
      const batch = await prepare(text, format, settings); expect(await preview(batch)).toMatchObject({ created: 500, linked: 0, skipped: 0, blockerCount: 0 });
      const token = randomUUID(); const response = await confirm(batch, token); expect(response.status).toBe(201); const result = await response.json(); expect(result).toMatchObject({ created: 500, linked: 0, skipped: 0 }); expect(result.rows).toHaveLength(500);
      expect(await (await confirm(batch, token)).json()).toEqual(result);
      const reimport = await prepare(text, format, settings); expect(await preview(reimport)).toMatchObject({ created: 0, linked: 500, blockerCount: 0 });
      expect(await (await confirm(reimport)).json()).toMatchObject({ created: 0, linked: 500 });
    }
    expect(await db.cardCharge.count()).toBe(1000); expect(await db.importOutcome.count()).toBe(2000); expect(await db.cardExternalIdentity.count()).toBe(1000);
    const charge = await db.cardCharge.findFirstOrThrow(); expect(charge.currency).toBe('BRL'); expect(charge.cardId).toBeNull(); expect(charge.installment).toEqual({ state: 'unknown' });
    expect(await (await request(`/entries?kind=card&accountId=${credit.id}`)).json()).toMatchObject({ total: 1000 });
  }, 60000);
  it('creates bank entries separately, preserves civil dates and exact BIGINT boundaries', async () => {
    const text = 'Date;Description;Amount;ID\n0001-01-01;Boundary;92233720368547758.07;boundary';
    const batch = await prepare(text, 'csv', { profile: { ...profile(), kind: 'bank' } }, alice.cookie, { financialAccountId: bank.id });
    expect((await confirm(batch)).status).toBe(201); const entry = await db.bankEntry.findFirstOrThrow(); expect(entry.cents).toBe(9223372036854775807n); expect(entry.postedOn.toISOString().slice(0, 10)).toBe('0001-01-01');
    expect(await db.cardCharge.count()).toBe(0); const result = await (await request(`/entries?kind=bank&accountId=${bank.id}`)).json(); expect(result.rows[0].amount.cents).toBe('9223372036854775807');
  });
  it('replays simultaneous confirmation and serializes separate batches with the same identity', async () => {
    const batch = await prepare(); const token = randomUUID();
    const responses = await Promise.all([confirm(batch, token), confirm(batch, token)]); expect(responses.map(value => value.status)).toEqual([201, 201]);
    expect(await responses[0]!.json()).toEqual(await responses[1]!.json()); expect(await db.cardCharge.count()).toBe(1);
    const a = await prepare(csv(1, 2)); const b = await prepare(csv(1, 2));
    const results = await Promise.all([confirm(a).then(value => value.json()), confirm(b).then(value => value.json())]); expect(results.map(value => value.created).sort()).toEqual([0, 1]);
    expect(await db.cardCharge.count()).toBe(2); expect(await db.importConfirmation.count()).toBe(3);
  });
  it('recovers a lost response after application restart and rejects changed idempotency/version commands', async () => {
    const batch = await prepare(); const token = randomUUID(); const result = await (await confirm(batch, token)).json();
    await app.close(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); worker = app.get(ImportWorker);
    expect(await (await confirm(batch, token)).json()).toEqual(result); expect((await confirm({ ...batch, version: batch.version + 1 }, token)).status).toBe(409);
    const another = await prepare(csv(1, 3)); expect((await confirm(another, token)).status).toBe(409);
    const changed = await request(`/imports/${another.id}/review`, { expectedVersion: another.version, all: { selected: false } }, 'PATCH'); expect(changed.status).toBe(200);
    expect((await confirm(another)).status).toBe(409); expect(await db.cardCharge.count()).toBe(1);
    expect((await request(`/imports/${batch.id}`, { expectedVersion: batch.version + 1 }, 'DELETE')).status).toBe(409);
  });
  it('rolls back every financial effect when persistence fails mid-batch', async () => {
    const batch = await prepare(csv(2));
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_second_charge() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."description" = 'Fictitious 1' THEN RAISE EXCEPTION 'Fictitious persistence failure'; END IF; RETURN NEW; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER test_charge_failure BEFORE INSERT ON "CardCharge" FOR EACH ROW EXECUTE FUNCTION reject_second_charge()`);
    try { expect((await confirm(batch)).status).toBe(500); } finally { await db.$executeRawUnsafe(`DROP TRIGGER test_charge_failure ON "CardCharge"`); await db.$executeRawUnsafe('DROP FUNCTION reject_second_charge()'); }
    expect(await db.cardCharge.count()).toBe(0); expect(await db.cardExternalIdentity.count()).toBe(0); expect(await db.importOutcome.count()).toBe(0); expect(await db.importConfirmation.count()).toBe(0);
    expect((await db.importBatch.findUniqueOrThrow({ where: { id: batch.id } })).status).toBe('review'); expect((await confirm(batch)).status).toBe(201);
  });
  it('keeps conflicting external identities blocked, including duplicate IDs inside a file', async () => {
    const batch = await prepare(); expect((await confirm(batch)).status).toBe(201);
    const conflict = await prepare(csv().replace('-12.34', '-12.35')); expect((await preview(conflict)).blockers[0].code).toBe('EXTERNAL_IDENTITY_CONFLICT'); expect((await confirm(conflict)).status).toBe(409);
    expect(await db.cardCharge.count()).toBe(1);
    const duplicates = await prepare('Date;Description;Amount;ID\n2026-10-08;A;-1.00;same\n2026-10-08;B;-2.00;same');
    expect((await confirm(duplicates)).status).toBe(409); expect(await db.cardCharge.count()).toBe(1);
    const repeated = await prepare('Date;Description;Amount;ID\n2026-10-08;A;-1.00;new\n2026-10-08;A;-1.00;new');
    expect(await (await confirm(repeated)).json()).toMatchObject({ created: 1, linked: 1 });
  });
  it('requires decisions for similarity and supports explicit linking, keeping both and skipping', async () => {
    const settings = { profile: { ...profile(false), columns: { date: 'Date', description: 'Description', amount: 'Amount' } } };
    const text = 'Date;Description;Amount\n2026-10-08;Same purchase;-10.00'; const initial = await prepare(text, 'csv', settings); const first = await (await confirm(initial)).json(); const recordId = first.rows[0].recordId;
    const reimport = await prepare(text, 'csv', settings); const row = (await rows(reimport)).rows[0]; expect(row.matches[0].reason).toBe('similar'); expect((await confirm(reimport)).status).toBe(409);
    const linked = await request(`/imports/${reimport.id}/review`, { expectedVersion: reimport.version, rows: [{ id: row.id, action: 'link', existingId: recordId }] }, 'PATCH');
    expect(linked.status).toBe(200); expect(await (await confirm({ id: reimport.id, version: (await linked.json()).version })).json()).toMatchObject({ created: 0, linked: 1 });
    const distinct = await prepare(text, 'csv', settings); const distinctRow = (await rows(distinct)).rows[0];
    const saved = await request(`/imports/${distinct.id}/review`, { expectedVersion: distinct.version, rows: [{ id: distinctRow.id, action: 'create', distinctFrom: recordId }] }, 'PATCH'); expect(saved.status).toBe(200);
    expect(await (await confirm({ id: distinct.id, version: (await saved.json()).version })).json()).toMatchObject({ created: 1, linked: 0 }); expect(await db.cardCharge.count()).toBe(2);
    const ignored = await prepare(text, 'csv', settings); const skip = await request(`/imports/${ignored.id}/review`, { expectedVersion: ignored.version, all: { selected: false } }, 'PATCH');
    expect(await (await confirm({ id: ignored.id, version: (await skip.json()).version })).json()).toMatchObject({ created: 0, linked: 0, skipped: 1 });
  });
  it('preserves legitimate identical rows and manual record descriptions/notes', async () => {
    const settings = { profile: { ...profile(false), columns: { date: 'Date', description: 'Description', amount: 'Amount' } } };
    const identical = await prepare('Date;Description;Amount\n2026-10-08;Same;-10.00\n2026-10-08;Same;-10.00', 'csv', settings);
    expect(await (await confirm(identical)).json()).toMatchObject({ created: 2, linked: 0 });
    const identified = await prepare(csv()); const result = await (await confirm(identified)).json(); const id = result.rows[0].recordId;
    await db.cardCharge.update({ where: { id }, data: { description: 'Descrição manual preservada', notes: 'Observação fictícia' } });
    const reimport = await prepare(csv()); expect(await (await confirm(reimport)).json()).toMatchObject({ created: 0, linked: 1 });
    expect(await db.cardCharge.findUniqueOrThrow({ where: { id } })).toMatchObject({ description: 'Descrição manual preservada', notes: 'Observação fictícia' });
  });
  it('isolates confirmations, suggestions, results and SQL references between owners', async () => {
    const batch = await prepare(); expect((await confirm(batch, randomUUID(), bob.cookie)).status).toBe(404); expect((await confirm(batch, randomUUID(), '')).status).toBe(401);
    const first = await (await confirm(batch)).json(); const bobBatch = await prepare(csv(), 'csv', { profile: profile() }, bob.cookie, { creditAccountId: bobCredit.id, statementId: bobStatement.id }); const bobRow = (await request(`/imports/${bobBatch.id}/rows`, undefined, 'GET', bob.cookie).then(value => value.json())).rows[0];
    expect(bobRow.matches).toEqual([]);
    expect((await request(`/imports/${bobBatch.id}/review`, { expectedVersion: bobBatch.version, rows: [{ id: bobRow.id, action: 'link', existingId: first.rows[0].recordId }] }, 'PATCH', bob.cookie)).status).toBe(404);
    await expect(db.importRow.update({ where: { id: bobRow.id }, data: { action: 'link', linkCardChargeId: first.rows[0].recordId } })).rejects.toThrow();
    expect((await request(`/entries?kind=card&accountId=${credit.id}`, undefined, 'GET', bob.cookie)).status).toBe(404);
    expect((await request(`/imports/${batch.id}`, undefined, 'GET', bob.cookie)).status).toBe(404);
    expect((await request(`/imports/${batch.id}/confirmation-preview`, undefined, 'GET', bob.cookie)).status).toBe(404);
    await expect(db.cardCharge.create({ data: { userId: alice.id, creditAccountId: credit.id, statementId: bobStatement.id, postedOn: new Date('2026-10-08'), description: 'Invalid', cents: -1n, installment: {}, fingerprint: 'x' } })).rejects.toThrow();
  });
  it('allows excluded incomplete lines but requires statement for every selected charge', async () => {
    const batch = await prepare(); const detail = await request(`/imports/${batch.id}/review`, { expectedVersion: batch.version, blocks: [{ id: (await (await request(`/imports/${batch.id}`)).json()).blocks[0].id, creditAccountId: credit.id }] }, 'PATCH');
    const version = (await detail.json()).version; expect((await confirm({ id: batch.id, version })).status).toBe(409);
    const ignored = await request(`/imports/${batch.id}/review`, { expectedVersion: version, all: { selected: false } }, 'PATCH');
    expect(await (await confirm({ id: batch.id, version: (await ignored.json()).version })).json()).toMatchObject({ created: 0, skipped: 1 }); expect(await db.cardCharge.count()).toBe(0);
  });
  it('preserves a partial installment and releases only raw bytes after confirmation', async () => {
    const settings = { profile: { ...profile(), columns: { ...profile().columns, installmentNumber: 'Part', installmentTotal: 'Parts' } } };
    const batch = await prepare('Date;Description;Amount;ID;Part;Parts\n2026-10-08;Partial purchase;-120.00;partial;3;', 'csv', settings);
    expect((await confirm(batch)).status).toBe(201); const charge = await db.cardCharge.findFirstOrThrow(); expect(charge.cents).toBe(-12000n);
    expect(charge.installment).toMatchObject({ state: 'confirmed', value: { number: 3, total: { state: 'unknown' } } }); expect(await db.cardCharge.count()).toBe(1);
    expect((await request(`/imports/${batch.id}/file`, { expectedVersion: batch.version + 1 }, 'DELETE', bob.cookie)).status).toBe(404);
    expect((await request(`/imports/${batch.id}/file`, { expectedVersion: batch.version + 1 }, 'DELETE')).status).toBe(200);
    expect((await request(`/imports/${batch.id}/file`)).status).toBe(404); expect(await db.cardCharge.count()).toBe(1); expect(await db.importSourceRecord.count()).toBe(1); expect(await db.importOutcome.count()).toBe(1);
  });
  it('blocks invalid selected rows and confirms only explicitly selected valid rows', async () => {
    const batch = await prepare('Date;Description;Amount;ID\n2026-10-08;Valid;-1.00;valid\n2026-10-08;Incomplete;unknown;incomplete');
    expect((await confirm(batch)).status).toBe(409); expect(await db.cardCharge.count()).toBe(0);
    const data = await rows(batch); const saved = await request(`/imports/${batch.id}/review`, { expectedVersion: batch.version, rows: [{ id: data.rows[1].id, selected: false }] }, 'PATCH');
    expect(await (await confirm({ id: batch.id, version: (await saved.json()).version })).json()).toMatchObject({ created: 1, linked: 0, skipped: 1 });
    expect(await db.cardCharge.count()).toBe(1); expect(await db.importOutcome.count()).toBe(2);
  });
  it('applies explicit bulk reconciliation without overriding excluded or ambiguous rows', async () => {
    const settings = { profile: { ...profile(false), columns: { date: 'Date', description: 'Description', amount: 'Amount' } } };
    const text = 'Date;Description;Amount\n2026-10-08;A;-1.00\n2026-10-08;B;-2.00'; const initial = await prepare(text, 'csv', settings); expect((await confirm(initial)).status).toBe(201);
    const repeated = await prepare(text, 'csv', settings); const saved = await request(`/imports/${repeated.id}/review`, { expectedVersion: repeated.version, all: { reconcile: 'link' } }, 'PATCH');
    expect(saved.status).toBe(200); expect(await (await confirm({ id: repeated.id, version: (await saved.json()).version })).json()).toMatchObject({ created: 0, linked: 2 });
    const distinct = await prepare(text, 'csv', settings); const choices = await request(`/imports/${distinct.id}/review`, { expectedVersion: distinct.version, all: { reconcile: 'distinct' } }, 'PATCH');
    expect(choices.status).toBe(200); expect(await (await confirm({ id: distinct.id, version: (await choices.json()).version })).json()).toMatchObject({ created: 2, linked: 0 });
    const ambiguous = await prepare(text, 'csv', settings); const data = await rows(ambiguous); const excluded = await request(`/imports/${ambiguous.id}/review`, { expectedVersion: ambiguous.version, rows: [{ id: data.rows[1].id, selected: false }] }, 'PATCH');
    const bulk = await request(`/imports/${ambiguous.id}/review`, { expectedVersion: (await excluded.json()).version, all: { reconcile: 'link' } }, 'PATCH'); expect(bulk.status).toBe(200);
    const remaining = await preview(ambiguous); expect(remaining.blockerCount).toBe(1); expect(remaining.skipped).toBe(1); expect((await rows(ambiguous)).rows[1].selected).toBe(false);
  });
});
