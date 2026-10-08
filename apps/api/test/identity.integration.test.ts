import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/app.js';
import { createDatabase } from '../dist/database.js';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { mailLink } from '../../../scripts/test-mail.mjs';

const origin = 'http://127.0.0.1:18080';
const password = 'Fictitious-password-123!';
let database: Awaited<ReturnType<typeof testDatabase>>;
let db: ReturnType<typeof createDatabase>;
let app: Awaited<ReturnType<typeof createApp>>;
let base: string;
let alice: { email: string; id: string; cookie: string };
let bob: typeof alice;
const config = () => ({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: origin,
  smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false });
function request(path: string, body?: unknown, cookie = '', method = body === undefined ? 'GET' : 'POST', headers = {}) {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
}
async function login(email: string, pass = password) {
  const response = await request('/auth/sign-in/email', { email, password: pass });
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  expect(cookie).toContain('session_token=');
  return { response, cookie };
}
async function register(label: string) {
  const email = `${label}-${randomUUID()}@rovere.test`;
  const signup = await request('/auth/sign-up/email', { name: label, email, password, callbackURL: `${origin}/?verified=1` });
  expect(signup.status).toBe(200);
  const user = (await signup.json()).user;
  expect((await request('/auth/sign-in/email', { email, password })).status).toBe(403);
  const url = new URL(await mailLink(email, 'Confirme'));
  const confirmation = await fetch(`${base}${url.pathname}${url.search}`, { redirect: 'manual' });
  expect([200, 302]).toContain(confirmation.status);
  const { cookie } = await login(email);
  return { email, id: user.id, cookie };
}

beforeAll(async () => {
  database = await testDatabase(); db = createDatabase(database.url);
  app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  alice = await register('Alice'); bob = await register('Bob');
});
beforeEach(async () => { await db.rateLimit.deleteMany(); });
afterAll(async () => { await app?.close(); await database?.close(); });

describe('RF-013 against PostgreSQL and SMTP', () => {
  it('exposes distinct liveness/readiness and verifies email before login', async () => {
    expect(await (await request('/health')).json()).toEqual({ status: 'ok', service: 'rovere-api', check: 'liveness' });
    expect(await (await request('/ready')).json()).toEqual({ status: 'ok' });
    expect((await db.user.findUniqueOrThrow({ where: { id: alice.id } })).emailVerified).toBe(true);
    const credential = await db.account.findFirstOrThrow({ where: { userId: alice.id } });
    expect(credential.password).not.toContain(password);
  });
  it('rejects anonymous and tampered sessions', async () => {
    for (const path of ['/me', '/accounts', '/accounts/missing']) {
      expect((await request(path)).status).toBe(401);
      expect((await request(path, undefined, 'better-auth.session_token=forged')).status).toBe(401);
    }
  });
  it('isolates list, lookup and update; rejects forged ownership', async () => {
    const created = await request('/accounts', { name: 'Conta fictícia Alice' }, alice.cookie);
    expect(created.status).toBe(201);
    const account = await created.json(); expect(account.currency).toBe('BRL');
    expect(await (await request('/accounts', undefined, bob.cookie)).json()).toEqual([]);
    expect((await request(`/accounts/${account.id}`, undefined, bob.cookie)).status).toBe(404);
    expect((await request(`/accounts/${account.id}`, { name: 'Ataque' }, bob.cookie, 'PATCH')).status).toBe(404);
    expect((await request('/accounts', { name: 'Ataque', userId: alice.id }, bob.cookie)).status).toBe(400);
    expect((await request(`/accounts/${account.id}`, { name: 'Renomeada' }, alice.cookie, 'PATCH')).status).toBe(200);
    expect((await db.financialAccount.findUniqueOrThrow({ where: { id: account.id } })).name).toBe('Renomeada');
  });
  it('rejects invalid names, origins and non-JSON requests', async () => {
    for (const name of ['', ' ', 'x'.repeat(101), 42]) expect((await request('/accounts', { name }, alice.cookie)).status).toBe(400);
    for (const Origin of ['', 'https://attacker.test']) {
      expect((await request('/accounts', { name: 'Blocked' }, alice.cookie, 'POST', { Origin })).status).toBe(403);
      expect((await request('/auth/sign-out', {}, alice.cookie, 'POST', { Origin })).status).toBe(403);
    }
    expect((await request('/accounts', { name: 'Blocked' }, alice.cookie, 'POST', { 'Content-Type': 'text/plain' })).status).toBe(403);
  });
  it('sets HttpOnly SameSite cookies and persists sessions across application restart', async () => {
    const { response, cookie } = await login(alice.email);
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(response.headers.get('set-cookie')).toMatch(/SameSite=Lax/i);
    await app.close(); db = createDatabase(database.url);
    app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
    expect((await request('/me', undefined, cookie)).status).toBe(200);
  });
  it('revokes logout sessions and denies expired server sessions', async () => {
    let result = await login(bob.email);
    expect((await request('/auth/sign-out', {}, result.cookie)).status).toBe(200);
    expect((await request('/me', undefined, result.cookie)).status).toBe(401);
    result = await login(bob.email);
    await db.session.updateMany({ where: { userId: bob.id }, data: { expiresAt: new Date(0) } });
    expect((await request('/me', undefined, result.cookie)).status).toBe(401);
  });
  it('recovers access by email, rejects token reuse and revokes all old sessions', async () => {
    const old = await login(alice.email);
    const response = await request('/auth/request-password-reset', { email: alice.email, redirectTo: `${origin}/?reset=1` });
    expect(response.status).toBe(200);
    const unknown = await request('/auth/request-password-reset', { email: 'missing@rovere.test', redirectTo: `${origin}/?reset=1` });
    expect(await unknown.json()).toEqual(await response.json());
    const url = new URL(await mailLink(alice.email, 'Redefina'));
    const redirected = await fetch(`${base}${url.pathname}${url.search}`, { redirect: 'manual' });
    const token = new URL(redirected.headers.get('location')!).searchParams.get('token');
    expect(token).toBeTruthy();
    const payload = { token, newPassword: `${password}new` };
    expect((await request('/auth/reset-password', payload)).status).toBe(200);
    expect((await request('/auth/reset-password', payload)).status).toBe(400);
    expect((await request('/me', undefined, old.cookie)).status).toBe(401);
    expect((await request('/auth/sign-in/email', { email: alice.email, password })).status).toBe(401);
    await login(alice.email, payload.newPassword);
  });
  it('rejects expired reset tokens and untrusted callback URLs', async () => {
    expect((await request('/auth/request-password-reset', { email: bob.email, redirectTo: 'https://attacker.test' })).status).toBe(403);
    await request('/auth/request-password-reset', { email: bob.email, redirectTo: `${origin}/?reset=1` });
    const url = new URL(await mailLink(bob.email, 'Redefina'));
    await db.verification.updateMany({ data: { expiresAt: new Date(0) } });
    const response = await fetch(`${base}${url.pathname}${url.search}`, { redirect: 'manual' });
    expect(response.headers.get('location')).toContain('INVALID_TOKEN');
    expect((await request('/auth/reset-password', { token: url.pathname.split('/').at(-1), newPassword: `${password}expired` })).status).toBe(400);
  });
  it('allows only one concurrent use of a reset token', async () => {
    const user = await register('Concurrent');
    await request('/auth/request-password-reset', { email: user.email, redirectTo: `${origin}/?reset=1` });
    const url = new URL(await mailLink(user.email, 'Redefina'));
    const token = url.pathname.split('/').at(-1);
    const results = await Promise.all([
      request('/auth/reset-password', { token, newPassword: `${password}first` }),
      request('/auth/reset-password', { token, newPassword: `${password}second` }),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 400]);
  });
  it('limits repeated login attempts', async () => {
    let status = 0;
    for (let i = 0; i < 11; i++) status = (await request('/auth/sign-in/email', { email: bob.email, password: 'incorrect-password' }, '', 'POST', { 'X-Forwarded-For': `198.51.100.${i + 1}`, 'X-Rovere-Client-IP': `198.51.100.${i + 1}` })).status;
    expect(status).toBe(429);
  });
});
