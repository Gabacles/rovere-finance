import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { ImportWorker, parseInWorker } from '../src/imports/worker.js';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { mailLink } from '../../../scripts/test-mail.mjs';

const origin = 'http://127.0.0.1:18080';
const config = () => ({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: origin,
  smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false, importsWorkerEnabled: false });
let database: Awaited<ReturnType<typeof testDatabase>>; let db: ReturnType<typeof createDatabase>;
let app: Awaited<ReturnType<typeof createApp>>; let base: string; let worker: ImportWorker;
let alice: { id: string; cookie: string }; let bob: typeof alice;
let bank: { id: string }; let bobBank: typeof bank; let credit: typeof bank; let secondCredit: typeof bank; let card: typeof bank; let statement: typeof bank;
const profile = (kind = 'bank') => ({ id: 'generic-v1', encoding: 'utf-8', delimiter: ';', headerLine: 1, dateFormat: 'YMD', decimal: '.', grouping: null, sign: 'as-is', currency: 'BRL', kind, columns: { date: 'Date', description: 'Description', amount: 'Amount' } });
const csv = (count = 1) => 'Date;Description;Amount\n' + Array.from({ length: count }, (_, index) => `2026-10-08;Fictitious ${index + 1};-12.34`).join('\n');
function request(path: string, body?: unknown, cookie = alice?.cookie ?? '', method = body === undefined ? 'GET' : 'POST') {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie, 'Idempotency-Key': randomUUID() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
}
function upload(text: string | Uint8Array, format = 'csv', config: unknown = { profile: profile() }, cookie = alice.cookie, token = randomUUID(), filename = `fictitious.${format}`, extra = {}) {
  const form = new FormData(); form.append('format', format); form.append('configuration', JSON.stringify(config));
  form.append('file', new Blob([typeof text === 'string' ? text : new Uint8Array(text)], { type: 'application/octet-stream' }), filename);
  return fetch(`${base}/api/imports`, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Idempotency-Key': token, ...extra }, body: form });
}
async function register(label: string) {
  const email = `${label}-${randomUUID()}@rovere.test`; const password = 'Fictitious-imports-123!';
  const signup = await request('/auth/sign-up/email', { name: label, email, password }); expect(signup.status).toBe(200);
  const user = (await signup.json()).user; const link = new URL(await mailLink(email, 'Confirme'));
  await fetch(`${base}${link.pathname}${link.search}`, { redirect: 'manual' });
  const login = await request('/auth/sign-in/email', { email, password }); expect(login.status).toBe(200);
  return { id: user.id, cookie: login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
async function parsed(text = csv(), kind = 'bank') {
  const response = await upload(text, 'csv', { profile: profile(kind) }); expect(response.status).toBe(201);
  const batch = await response.json(); expect(await worker.runOnce()).toBe(true);
  const detail = await (await request(`/imports/${batch.id}`)).json(); expect(detail.status).toBe('review'); return detail;
}
async function rows(batchId: string, query = '') { return (await request(`/imports/${batchId}/rows${query}`)).json(); }
async function patch(batch: { id: string; version: number }, changes: unknown) {
  return request(`/imports/${batch.id}/review`, { expectedVersion: batch.version, ...(changes as object) }, alice.cookie, 'PATCH');
}
beforeAll(async () => {
  database = await testDatabase(); db = createDatabase(database.url);
  app = await createApp(config(), db);
  await app.listen(0, '127.0.0.1'); base = await app.getUrl(); worker = app.get(ImportWorker);
  alice = await register('Alice'); bob = await register('Bob');
  bank = await (await request('/accounts', { name: 'Banco fictício' })).json(); bobBank = await (await request('/accounts', { name: 'Banco Bob' }, bob.cookie)).json();
  credit = await (await request('/credit-accounts', { name: 'Crédito fictício' })).json(); secondCredit = await (await request('/credit-accounts', { name: 'Outro crédito' })).json();
  card = await (await request(`/credit-accounts/${credit.id}/cards`, { name: 'Virtual', kind: 'virtual' })).json();
  statement = await (await request(`/credit-accounts/${credit.id}/statements`, { period: '2026-10' })).json();
});
beforeEach(async () => { await db.importBatch.deleteMany(); });
afterAll(async () => { await app?.close(); await database?.close(); });

describe('RF-017 private upload and persisted review', () => {
  it('parses 500 CSV and OFX rows in real workers, preserving bytes, provenance and pagination', async () => {
    const template = await readFile('packages/importers/test/fixtures/card-220.ofx', 'utf8');
    const first = template.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/)![0];
    const ofx = template.replace(/<STMTTRN>[\s\S]*<\/STMTTRN>/, Array.from({ length: 500 }, (_, index) => first.replace(/<FITID>[^<]+<\/FITID>/, `<FITID>fictitious-${index}</FITID>`)).join(''));
    for (const [text, format, config] of [[csv(500), 'csv', { profile: profile() }], [ofx, 'ofx', {}]] as const) {
      const response = await upload(text, format, config); expect(response.status).toBe(201); const batch = await response.json();
      expect(await worker.runOnce()).toBe(true);
      const detail = await (await request(`/imports/${batch.id}`)).json(); expect(detail.status).toBe('review'); expect(detail.rowCount).toBe(500); expect(detail.parsedMetadata.adapterVersion).toBe('1');
      const page = await rows(batch.id, '?page=2&pageSize=25'); expect(page.total).toBe(500); expect(page.rows).toHaveLength(25); expect(page.rows[0].source.ordinal).toBe(26);
      expect(page.rows[0].candidate.amount.state).toBe('confirmed'); expect(typeof page.rows[0].candidate.amount.value.cents).toBe('string');
      expect(page.rows[0].source.raw).toBeTruthy(); expect(page.rows[0].candidate.installment.state).toBe('unknown');
      expect(await (await request(`/imports/${batch.id}/file`)).text()).toBe(text);
      expect(await db.importSourceRecord.count({ where: { batchId: batch.id } })).toBe(500);
      expect(await db.importRow.count({ where: { batchId: batch.id } })).toBe(500);
    }
  });
  it('denies cross-user files, batches, rows, revisions, retries and cancellation', async () => {
    const batch = await parsed();
    for (const path of [`/imports/${batch.id}`, `/imports/${batch.id}/file`, `/imports/${batch.id}/rows`]) {
      expect((await request(path, undefined, bob.cookie)).status).toBe(404); expect((await request(path, undefined, '')).status).toBe(401);
    }
    expect(await (await request('/imports', undefined, bob.cookie)).json()).toEqual([]);
    expect((await request(`/imports/${batch.id}/review`, { expectedVersion: 1, all: { selected: false } }, bob.cookie, 'PATCH')).status).toBe(404);
    expect((await request(`/imports/${batch.id}/retry`, { expectedVersion: 1 }, bob.cookie)).status).toBe(404);
    expect((await request(`/imports/${batch.id}`, { expectedVersion: 1 }, bob.cookie, 'DELETE')).status).toBe(404);
    expect((await upload(csv(), 'csv', { profile: profile() }, '')).status).toBe(401);
    expect((await upload(csv(), 'csv', { profile: profile() }, alice.cookie, randomUUID(), 'fictitious.csv', { Origin: 'https://attacker.test' })).status).toBe(403);
  });
  it('enforces file, configuration, quota and pagination bounds before creating candidates', async () => {
    expect((await upload(new Uint8Array(10 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await upload('')).status).toBe(400); expect((await upload(csv(), 'csv', { profile: profile() }, alice.cookie, randomUUID(), 'wrong.ofx')).status).toBe(400);
    expect((await upload(csv(), 'csv', { profile: { ...profile(), columns: { date: 1 } } })).status).toBe(400);
    const batch = await parsed(); expect((await request(`/imports/${batch.id}/rows?pageSize=101`)).status).toBe(400);
    const malformed = await fetch(`${base}/api/imports/${batch.id}/review`, { method: 'PATCH', headers: { Origin: origin, Cookie: alice.cookie, 'Content-Type': 'application/json' }, body: '{"description":"private-fictitious-fixture"' });
    expect(malformed.status).toBe(400); expect(await malformed.text()).not.toContain('private-fictitious-fixture');
    for (let index = 0; index < 19; index++) expect((await upload(csv())).status).toBe(201);
    expect((await upload(csv())).status).toBe(409);
  });
  it('replays concurrent uploads and rejects same-key content changes', async () => {
    const token = randomUUID(); const responses = await Promise.all([upload(csv(), 'csv', { profile: profile() }, alice.cookie, token), upload(csv(), 'csv', { profile: profile() }, alice.cookie, token)]);
    expect(responses.map(response => response.status)).toEqual([201, 201]); const [a, b] = await Promise.all(responses.map(response => response.json())); expect(a.id).toBe(b.id);
    expect(await db.importBatch.count()).toBe(1); expect((await upload(csv(2), 'csv', { profile: profile() }, alice.cookie, token)).status).toBe(409);
  });
  it('persists manual corrections and bulk selection with atomic version conflicts, leaving evidence immutable', async () => {
    const batch = await parsed(csv(2)); const initial = await rows(batch.id); const row = initial.rows[0];
    const response = await patch(batch, { rows: [{ id: row.id, corrections: { description: 'Correção manual', amount: { currency: 'BRL', cents: '-1235' }, installment: { number: 3 } } }] }); expect(response.status).toBe(200);
    const corrected = (await rows(batch.id)).rows[0]; expect(corrected.source).toEqual(row.source); expect(corrected.originalCandidate).toEqual(row.originalCandidate);
    expect(corrected.candidate.description.value).toBe('Correção manual'); expect(corrected.candidate.amount.value.cents).toBe('-1235'); expect(corrected.candidate.installment.value.total.state).toBe('unknown');
    expect((await patch(batch, { all: { selected: false } })).status).toBe(409);
    expect((await patch({ id: batch.id, version: 2 }, { rows: [{ id: row.id, corrections: { description: 'Não salvar' } }, { id: 'missing' }] })).status).toBe(404);
    expect((await rows(batch.id)).version).toBe(2); expect((await rows(batch.id)).rows[0].candidate.description.value).toBe('Correção manual');
    const concurrent = await Promise.all([patch({ id: batch.id, version: 2 }, { all: { selected: false } }), patch({ id: batch.id, version: 2 }, { all: { selected: true } })]); expect(concurrent.map(response => response.status).sort()).toEqual([200, 409]);
    await expect(db.importSourceRecord.update({ where: { id: row.source.id }, data: { raw: 'Tampered' } })).rejects.toThrow();
    await expect(db.importRow.update({ where: { id: row.id }, data: { candidate: {} } })).rejects.toThrow();
    expect(await db.importReviewRevision.count({ where: { batchId: batch.id } })).toBe(2);
    await app.close(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); worker = app.get(ImportWorker);
    expect((await rows(batch.id)).rows[0].candidate.description.value).toBe('Correção manual');
    expect(await (await request(`/imports/${batch.id}/file`)).text()).toBe(csv(2));
  });
  it('validates typed destinations and period conflicts without inferring a card or invoice', async () => {
    const batch = await parsed(); const blockId = batch.blocks[0].id;
    expect((await patch(batch, { blocks: [{ id: blockId, financialAccountId: bobBank.id }] })).status).toBe(404);
    expect((await rows(batch.id)).version).toBe(1);
    await expect(db.importBlock.update({ where: { id: blockId }, data: { financialAccountId: bobBank.id } })).rejects.toThrow();
    expect((await patch(batch, { blocks: [{ id: blockId, financialAccountId: bank.id }] })).status).toBe(200);
    expect((await rows(batch.id)).rows[0].candidate.issues).toEqual([]);
    const config = { profile: { ...profile('card'), columns: { ...profile().columns, statementPeriod: 'Period' } } };
    const uploadResponse = await upload('Date;Description;Amount;Period\n2026-10-08;Fictitious;-12.34;2026-11', 'csv', config); const cardBatch = await uploadResponse.json(); await worker.runOnce();
    const detail = await (await request(`/imports/${cardBatch.id}`)).json(); const cardBlock = detail.blocks[0].id;
    expect((await patch(detail, { blocks: [{ id: cardBlock, creditAccountId: secondCredit.id, cardId: card.id, statementId: statement.id }] })).status).toBe(404);
    await expect(db.importBlock.update({ where: { id: cardBlock }, data: { creditAccountId: secondCredit.id, cardId: card.id } })).rejects.toThrow();
    expect((await patch(detail, { blocks: [{ id: cardBlock, creditAccountId: credit.id, statementId: statement.id }] })).status).toBe(200);
    const conflicted = await rows(detail.id); expect(conflicted.rows[0].candidate.issues.map((issue: { code: string }) => issue.code)).toContain('STATEMENT_PERIOD_CONFLICT');
    expect((await patch({ id: detail.id, version: 2 }, { blocks: [{ id: cardBlock, creditAccountId: credit.id, statementId: statement.id, periodOverride: true }] })).status).toBe(200);
    expect((await rows(detail.id)).rows[0].candidate.issues).toEqual([]); expect((await db.importBlock.findUniqueOrThrow({ where: { id: cardBlock } })).cardId).toBeNull();
  });
  it('retries failed configuration while refusing to reprocess corrected reviews', async () => {
    const response = await upload(csv(), 'csv', { profile: { ...profile(), columns: { ...profile().columns, amount: 'Wrong' } } }); const batch = await response.json(); await worker.runOnce();
    const failed = await (await request(`/imports/${batch.id}`)).json(); expect(failed.status).toBe('failed'); expect(failed.errorCode).toBe('INVALID_CSV_COLUMNS');
    expect(await db.importRow.count({ where: { batchId: batch.id } })).toBe(0);
    const retries = await Promise.all([request(`/imports/${batch.id}/retry`, { expectedVersion: failed.version, configuration: { profile: profile() } }), request(`/imports/${batch.id}/retry`, { expectedVersion: failed.version, configuration: { profile: profile() } })]);
    expect(retries.map(value => value.status).sort()).toEqual([201, 409]); await worker.runOnce();
    expect((await db.importReviewRevision.findFirstOrThrow({ where: { batchId: batch.id } })).changes).toMatchObject({ action: 'retry', previousConfiguration: { profile: { columns: { amount: 'Wrong' } } } });
    const ready = await (await request(`/imports/${batch.id}`)).json(); const row = (await rows(batch.id)).rows[0];
    expect((await patch(ready, { rows: [{ id: row.id, corrections: { description: 'Preservada' } }] })).status).toBe(200);
    expect((await request(`/imports/${batch.id}/retry`, { expectedVersion: ready.version + 1 })).status).toBe(409);
    expect((await rows(batch.id)).rows[0].candidate.description.value).toBe('Preservada');
  });
  it('claims once concurrently and fences a recovered lease against late writes', async () => {
    const response = await upload(csv()); const batch = await response.json();
    expect((await Promise.all([worker.runOnce(), new ImportWorker(db, false).runOnce()])).sort()).toEqual([false, true]);
    expect(await db.importRow.count({ where: { batchId: batch.id } })).toBe(1);
    await db.importBatch.deleteMany();
    const next = await (await upload(csv())).json();
    const prepared = await parseInWorker(new TextEncoder().encode(csv()), next.id, 'csv', { profile: profile() });
    let release!: (value: typeof prepared) => void; const delayed = new Promise<typeof prepared>(resolve => { release = resolve; });
    const slow = new ImportWorker(db, false); vi.spyOn(slow, 'parse').mockReturnValueOnce(delayed);
    const old = slow.runOnce(); await vi.waitFor(async () => expect((await db.importBatch.findUniqueOrThrow({ where: { id: next.id } })).status).toBe('parsing'));
    await db.importBatch.update({ where: { id: next.id }, data: { leaseUntil: new Date(0) } });
    expect(await worker.runOnce()).toBe(true); const ready = await (await request(`/imports/${next.id}`)).json(); const row = (await rows(next.id)).rows[0];
    expect((await patch(ready, { rows: [{ id: row.id, corrections: { description: 'Após recuperação' } }] })).status).toBe(200);
    release(prepared); await old;
    expect(await db.importRow.count({ where: { batchId: next.id } })).toBe(1); expect((await rows(next.id)).rows[0].candidate.description.value).toBe('Após recuperação');
  });
  it('rolls back parser persistence failures and bounds time and exhausted attempts', async () => {
    const batch = await (await upload(csv())).json(); const prepared = await parseInWorker(new TextEncoder().encode(csv()), batch.id, 'csv', { profile: profile() });
    const broken = new ImportWorker(db, false); vi.spyOn(broken, 'parse').mockResolvedValueOnce({ ...prepared, blocks: [...prepared.blocks, prepared.blocks[0]!] }); await broken.runOnce();
    expect((await db.importBatch.findUniqueOrThrow({ where: { id: batch.id } })).status).toBe('failed'); expect(await db.importBlock.count()).toBe(0); expect(await db.importRow.count()).toBe(0);
    await expect(parseInWorker(new TextEncoder().encode(csv()), batch.id, 'csv', { profile: profile() }, 0)).rejects.toThrow('PARSER_TIMEOUT');
    await db.importBatch.update({ where: { id: batch.id }, data: { status: 'parsing', attempts: 3, leaseToken: randomUUID(), leaseUntil: new Date(0) } });
    expect(await worker.runOnce()).toBe(false); expect((await db.importBatch.findUniqueOrThrow({ where: { id: batch.id } })).errorCode).toBe('ATTEMPTS_EXHAUSTED');
  });
  it('removes an unconfirmed import and all its private evidence on explicit cancellation', async () => {
    const batch = await parsed(); expect((await request(`/imports/${batch.id}`, { expectedVersion: batch.version }, alice.cookie, 'DELETE')).status).toBe(200);
    expect((await request(`/imports/${batch.id}/file`)).status).toBe(404); expect(await db.importFile.count()).toBe(0); expect(await db.importRow.count()).toBe(0); expect(await db.importSourceRecord.count()).toBe(0);
    expect((await request(`/imports/${batch.id}/retry`, { expectedVersion: 2 })).status).toBe(409);
  });
});
