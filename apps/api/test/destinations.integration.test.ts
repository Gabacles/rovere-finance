import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { mailLink } from '../../../scripts/test-mail.mjs';

const origin = 'http://127.0.0.1:18080';
let database: Awaited<ReturnType<typeof testDatabase>>;
let db: ReturnType<typeof createDatabase>;
let app: Awaited<ReturnType<typeof createApp>>;
let base: string;
let alice: { id: string; cookie: string };
let bob: typeof alice;
let credit: { id: string };
function request(path: string, body?: unknown, cookie = alice?.cookie ?? '', key = randomUUID(), extra = {}) {
  return fetch(`${base}/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: {
    Origin: origin, 'Content-Type': 'application/json', Cookie: cookie, 'Idempotency-Key': key, ...extra,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
}
async function register(label: string) {
  const email = `${label}-${randomUUID()}@rovere.test`; const password = 'Fictitious-destinations-123!';
  const signup = await request('/auth/sign-up/email', { name: label, email, password });
  expect(signup.status).toBe(200); const user = (await signup.json()).user;
  const link = new URL(await mailLink(email, 'Confirme'));
  await fetch(`${base}${link.pathname}${link.search}`, { redirect: 'manual' });
  const login = await request('/auth/sign-in/email', { email, password }); expect(login.status).toBe(200);
  return { id: user.id, cookie: login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
beforeAll(async () => {
  database = await testDatabase(); db = createDatabase(database.url);
  app = await createApp({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: origin,
    smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false }, db);
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  alice = await register('Alice'); bob = await register('Bob');
  const response = await request('/credit-accounts', { name: 'Crédito fictício' }); expect(response.status).toBe(201); credit = await response.json();
});
afterAll(async () => { await app?.close(); await database?.close(); });

describe('RF-016 destinations against PostgreSQL', () => {
  it('keeps authentication accounts, financial accounts and credit separate without inventing values', async () => {
    const bank = await request('/accounts', { name: 'Conta bancária fictícia' }); expect(bank.status).toBe(201);
    const result = await (await request(`/credit-accounts/${credit.id}`)).json();
    expect(result).toEqual({ id: credit.id, name: 'Crédito fictício', currency: 'BRL' });
    expect(await db.account.count({ where: { userId: alice.id } })).toBe(1);
    expect(await db.financialAccount.count({ where: { userId: alice.id } })).toBe(1);
    expect(await (await request(`/credit-accounts/${credit.id}/statements`)).json()).toEqual([]);
  });
  it('denies anonymous requests and isolates lists, parents and writes between users', async () => {
    for (const path of ['/credit-accounts', `/credit-accounts/${credit.id}`, `/credit-accounts/${credit.id}/cards`, `/credit-accounts/${credit.id}/statements`]) {
      expect((await request(path, undefined, '')).status).toBe(401);
      if (path !== '/credit-accounts') expect((await request(path, undefined, bob.cookie)).status).toBe(404);
    }
    expect((await request('/credit-accounts', { name: 'Anônima' }, '')).status).toBe(401);
    expect(await (await request('/credit-accounts', undefined, bob.cookie)).json()).toEqual([]);
    expect((await request(`/credit-accounts/${credit.id}/cards`, { name: 'Intruso', kind: 'virtual' }, bob.cookie)).status).toBe(404);
    expect((await request(`/credit-accounts/${credit.id}/statements`, { period: '2026-10' }, bob.cookie)).status).toBe(404);
    expect((await request('/credit-accounts', { name: 'Intruso', userId: alice.id }, bob.cookie)).status).toBe(400);
    expect((await request(`/credit-accounts/${credit.id}/cards`, { name: 'Intruso', kind: 'physical', userId: bob.id })).status).toBe(400);
    expect((await request(`/credit-accounts/${credit.id}/statements`, { period: '2026-10', userId: bob.id })).status).toBe(400);
  });
  it('supports physical, virtual and additional cards sharing credit and confirmed periods', async () => {
    for (const kind of ['physical', 'virtual', 'additional']) {
      const response = await request(`/credit-accounts/${credit.id}/cards`, { name: `Cartão ${kind}`, kind }); expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ creditAccountId: credit.id, kind });
    }
    const response = await request(`/credit-accounts/${credit.id}/statements`, { period: '2026-10' }); expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: expect.any(String), creditAccountId: credit.id, period: '2026-10', periodOrigin: 'manual' });
    expect((await (await request(`/credit-accounts/${credit.id}/cards`)).json()).length).toBe(3);
    expect((await (await request(`/credit-accounts/${credit.id}/statements`)).json()).length).toBe(1);
  });
  it('validates periods, names, kinds, unknown fields, idempotency headers and trusted origins', async () => {
    for (const period of ['', '0000-01', '2026-00', '2026-13', '2026-1', '2026-10-01', '10/2026', 202610, null]) {
      const response = await request(`/credit-accounts/${credit.id}/statements`, { period }); expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'INVALID_STATEMENT_PERIOD', requestId: expect.any(String), violations: [{ field: 'period', code: 'INVALID_STATEMENT_PERIOD' }] });
    }
    for (const name of ['', ' ', 'x'.repeat(101), 12]) expect((await request('/credit-accounts', { name })).status).toBe(400);
    expect((await request(`/credit-accounts/${credit.id}/cards`, { name: 'Inválido', kind: 'other' })).status).toBe(400);
    expect((await request('/credit-accounts', { name: 'Crédito', limit: '10000' })).status).toBe(400);
    expect((await request('/credit-accounts', { name: 'Crédito' }, alice.cookie, '')).status).toBe(400);
    expect((await request('/credit-accounts', { name: 'Crédito' }, alice.cookie, 'bad key')).status).toBe(400);
    expect((await request('/credit-accounts', { name: 'Crédito' }, alice.cookie, randomUUID(), { Origin: 'https://attacker.test' })).status).toBe(403);
    expect((await request('/credit-accounts', { name: 'Crédito' }, alice.cookie, randomUUID(), { 'Content-Type': 'text/plain' })).status).toBe(403);
  });
  it('replays simultaneous creation requests and rejects changed payloads for all resources', async () => {
    for (const [path, body, changed] of [
      ['/credit-accounts', { name: 'Idempotente' }, { name: 'Outro nome' }],
      [`/credit-accounts/${credit.id}/cards`, { name: 'Cartão idempotente', kind: 'virtual' }, { name: 'Cartão idempotente', kind: 'physical' }],
      [`/credit-accounts/${credit.id}/statements`, { period: '2026-11' }, { period: '2026-12' }],
    ] as const) {
      const key = randomUUID();
      const responses = await Promise.all([request(path, body, alice.cookie, key), request(path, body, alice.cookie, key)]);
      expect(responses.map(value => value.status)).toEqual([201, 201]);
      const [first, second] = await Promise.all(responses.map(value => value.json())); expect(first).toEqual(second);
      expect(await (await request(path, body, alice.cookie, key)).json()).toEqual(first);
      expect((await request(path, changed, alice.cookie, key)).status).toBe(409);
    }
  });
  it('rejects duplicate periods while allowing the same month in distinct credit accounts', async () => {
    expect((await request(`/credit-accounts/${credit.id}/statements`, { period: '2026-10' })).status).toBe(409);
    const second = await (await request('/credit-accounts', { name: 'Outro crédito' })).json();
    expect((await request(`/credit-accounts/${second.id}/statements`, { period: '2026-10' })).status).toBe(201);
    const key = randomUUID(); const body = { name: 'Chave escopada' };
    const a = await (await request('/credit-accounts', body, alice.cookie, key)).json();
    const b = await (await request('/credit-accounts', body, bob.cookie, key)).json(); expect(a.id).not.toBe(b.id);
  });
  it('enforces ownership, kind and period constraints even when bypassing HTTP', async () => {
    await expect(db.card.create({ data: { userId: bob.id, creditAccountId: credit.id, name: 'Vínculo proibido', kind: 'physical', creationKey: randomUUID() } })).rejects.toThrow();
    await expect(db.statement.create({ data: { userId: bob.id, creditAccountId: credit.id, period: '2027-01', creationKey: randomUUID() } })).rejects.toThrow();
    await expect(db.card.create({ data: { userId: alice.id, creditAccountId: credit.id, name: 'Inválido', kind: 'other', creationKey: randomUUID() } })).rejects.toThrow();
    await expect(db.statement.create({ data: { userId: alice.id, creditAccountId: credit.id, period: '0000-01', creationKey: randomUUID() } })).rejects.toThrow();
    const card = await db.card.findFirstOrThrow({ where: { creditAccountId: credit.id } });
    await expect(db.card.update({ where: { id: card.id }, data: { userId: bob.id } })).rejects.toThrow();
    const statement = await db.statement.findFirstOrThrow({ where: { creditAccountId: credit.id } });
    await expect(db.statement.update({ where: { id: statement.id }, data: { userId: bob.id } })).rejects.toThrow();
    expect(await db.card.count({ where: { userId: bob.id } })).toBe(0);
    expect(await db.statement.count({ where: { userId: bob.id } })).toBe(0);
  });
  it('reapplies migrations without losing destinations, credentials or bank accounts', async () => {
    const before = await Promise.all([db.creditAccount.count(), db.card.count(), db.statement.count(), db.account.count(), db.financialAccount.count()]);
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts'], { env: { ...process.env, DATABASE_URL: database.url }, stdio: 'pipe' });
    expect(await Promise.all([db.creditAccount.count(), db.card.count(), db.statement.count(), db.account.count(), db.financialAccount.count()])).toEqual(before);
  });
});
