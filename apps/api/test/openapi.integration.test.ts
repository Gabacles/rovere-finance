import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { mailLink } from '../../../scripts/test-mail.mjs';
import { contractValidator } from './openapi-validator.js';

const origin = 'http://127.0.0.1:18080';
let database: Awaited<ReturnType<typeof testDatabase>>; let db: ReturnType<typeof createDatabase>; let app: Awaited<ReturnType<typeof createApp>>; let base: string; let document: any; let cookie = '';
const config = () => ({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: origin, smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false, importsWorkerEnabled: false });
async function request(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', extra: Record<string, string> = {}) {
  return fetch(`${base}${path}`, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
}
async function responseContract(response: Response, template: string, method = 'get') {
  const value = await response.json();
  const op = document.paths[template][method]; const schema = op.responses[String(response.status)]?.content['application/json'].schema;
  expect(schema, `${method} ${template}: undocumented ${response.status}`).toBeDefined();
  const validate = contractValidator(document, schema); expect(validate(value), JSON.stringify(validate.errors)).toBe(true); return value;
}
beforeAll(async () => { database = await testDatabase(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); document = await (await request('/api/openapi.json')).json(); });
afterAll(async () => { await app?.close(); await database?.close(); });

describe('RF-026 live HTTP documentation and contracts', () => {
  it('serves local UI/spec/assets without leaking configuration, external validators or relaxing private guards', async () => {
    const html = await request('/api/docs'); expect(html.status).toBe(200); expect(await html.text()).toContain('Swagger');
    expect(html.headers.get('cache-control')).toBe('no-store'); expect(html.headers.get('content-security-policy')).toContain("connect-src 'self'");
    const asset = await request('/api/docs/swagger-ui-bundle.js'); expect(asset.status).toBe(200);
    expect((await request('/api/docs/init.js')).status).toBe(200); expect((await request('/api/docs/swagger-initializer.js')).status).toBe(404);
    const json = JSON.stringify(document); expect(json).not.toContain(config().authSecret); expect(json).not.toContain(database.url); expect(document.servers).toEqual([{ url: '/' }]);
    await responseContract(await request('/api/health'), '/api/health');
    await responseContract(await request('/api/accounts'), '/api/accounts');
    expect(await responseContract(await request('/api/auth/get-session'), '/api/auth/get-session')).toBeNull();
    const denied = await request('/api/accounts', { name: 'Conta fictícia' }, 'POST', { Origin: 'https://untrusted.test' }); expect(denied.status).toBe(403);
    await responseContract(denied, '/api/accounts', 'post');
  });
  it('validates actual identity, destinations, purchase, plan, fatura, adjustment/refund and payment contracts', async () => {
    const email = `docs-${randomUUID()}@rovere.test`; const password = 'Fictitious-documentation-123!';
    await responseContract(await request('/api/auth/sign-up/email', { name: 'Pessoa fictícia', email, password }), '/api/auth/sign-up/email', 'post');
    const url = new URL(await mailLink(email, 'Confirme')); await fetch(`${base}${url.pathname}${url.search}`, { redirect: 'manual' });
    const login = await request('/api/auth/sign-in/email', { email, password }); expect(login.status).toBe(200); cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    await responseContract(login, '/api/auth/sign-in/email', 'post');
    await responseContract(await request('/api/me'), '/api/me');
    await responseContract(await request('/api/auth/get-session'), '/api/auth/get-session');
    const bank = await responseContract(await request('/api/accounts', { name: 'Conta fictícia' }), '/api/accounts', 'post');
    const credit = await responseContract(await request('/api/credit-accounts', { name: 'Crédito fictício' }), '/api/credit-accounts', 'post');
    await responseContract(await request(`/api/credit-accounts/${credit.id}/cards`, { name: 'Virtual fictício', kind: 'virtual' }), '/api/credit-accounts/{id}/cards', 'post');
    const stmt = await responseContract(await request(`/api/credit-accounts/${credit.id}/statements`, { period: '2026-10' }), '/api/credit-accounts/{id}/statements', 'post');
    const path = `/api/credit-accounts/${credit.id}/statements/${stmt.id}`; const template = '/api/credit-accounts/{creditId}/statements/{statementId}';
    const expense = await responseContract(await request('/api/expenses', { description: 'Compra fictícia', facts: { purchasedOn: '2026-10-14', total: { currency: 'BRL', cents: '10000' } } }), '/api/expenses', 'post');
    await responseContract(await request(`/api/expenses/${expense.id}/installment-plan`, { expectedVersion: expense.version, total: { currency: 'BRL', cents: '10000' }, count: 2, creditAccountId: credit.id, firstPeriod: '2026-10', cadence: 'monthly' }), '/api/expenses/{id}/installment-plan', 'post');
    await responseContract(await request('/api/expenses'), '/api/expenses');
    await responseContract(await request(path), template);
    await responseContract(await request(`${path}/summary`), `${template}/summary`);
    const fact = await responseContract(await request(path, { expectedVersion: 0, facts: { declaredTotal: { currency: 'BRL', cents: '5000' } } }, 'PATCH'), template, 'patch');
    const payments = await responseContract(await request(`${path}/payments`), `${template}/payments`);
    const basis = await responseContract(await request(`${path}/payments/basis`, { expectedStatementVersion: fact.version, kind: 'declared', referenceHash: payments.candidates.declared.referenceHash, beforePaymentsConfirmed: true, independentObligationConfirmed: true }), `${template}/payments/basis`, 'post');
    const entry = await db.bankEntry.create({ data: { userId: (await (await request('/api/me')).json()).id, accountId: bank.id, postedOn: new Date('2026-10-14T00:00:00Z'), description: 'Saída fictícia', cents: -5000n, fingerprint: 'f'.repeat(64) } });
    await responseContract(await request(`/api/bank-entries/${entry.id}/payment-source`), '/api/bank-entries/{id}/payment-source');
    await responseContract(await request(`${path}/payments`, { expectedStatementVersion: basis.statement.statementVersion, bankEntryId: entry.id, expectedBankVersion: 0, confirmedOutflow: { currency: 'BRL', cents: '5000' }, outflowConfirmed: true, amount: { currency: 'BRL', cents: '5000' } }), `${template}/payments`, 'post');
    const current = await (await request(path)).json();
    const adjusted = await responseContract(await request(`${path}/adjustments`, { expectedStatementVersion: current.version, postedOn: '2026-10-14', description: 'Estorno fictício', amount: { currency: 'BRL', cents: '2000' }, classification: { nature: 'refund', amount: { currency: 'BRL', cents: '2000' } }, reason: 'Documento fictício', informedConfirmed: true }), `${template}/adjustments`, 'post');
    await responseContract(await request(`/api/card-charges/${adjusted.charge.id}`), '/api/card-charges/{id}');
    const exp = await (await request(`/api/expenses/${expense.id}`)).json();
    await responseContract(await request(`/api/expenses/${expense.id}/refunds`, { expectedExpenseVersion: exp.version, expectedChargeVersion: adjusted.charge.version, expectedStatementVersion: adjusted.statement.version, chargeId: adjusted.charge.id, amount: { currency: 'BRL', cents: '2000' }, reason: 'Associação fictícia', associationConfirmed: true }), '/api/expenses/{expenseId}/refunds', 'post');
    await responseContract(await request(`/api/entries?kind=card&accountId=${credit.id}`), '/api/entries');
    for (const [route, schemaPath] of [[`${path}/history`, `${template}/history`], [`${path}/payments/history`, `${template}/payments/history`], [`${path}/adjustments/history`, `${template}/adjustments/history`], [`/api/expenses/${expense.id}/history`, '/api/expenses/{id}/history'], [`/api/expenses/${expense.id}/refunds/history`, '/api/expenses/{expenseId}/refunds/history']]) await responseContract(await request(route!), schemaPath!);
  });
  it('documents multipart/rows/review/confirm/download and actual conflict errors', async () => {
    const bank = await (await request('/api/accounts', { name: 'CSV fictício' })).json();
    const form = new FormData(); form.set('file', new Blob(['data;descricao;valor\n14/10/2026;Linha fictícia;-10,00']), 'ficticio.csv'); form.set('format', 'csv'); form.set('configuration', JSON.stringify({ profile: { id: 'docs_csv', encoding: 'utf-8', delimiter: ';', headerLine: 1, dateFormat: 'DMY', decimal: ',', grouping: '.', sign: 'as-is', currency: 'BRL', kind: 'bank', columns: { date: 'data', description: 'descricao', amount: 'valor' } } }));
    const batch = await responseContract(await fetch(`${base}/api/imports`, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Idempotency-Key': randomUUID() }, body: form }), '/api/imports', 'post');
    const { ImportWorker } = await import('../src/imports/worker.js'); await app.get(ImportWorker).runOnce();
    const details = await responseContract(await request(`/api/imports/${batch.id}`), '/api/imports/{id}');
    expect(details.status).toBe('review');
    await responseContract(await request('/api/imports'), '/api/imports');
    await responseContract(await request(`/api/imports/${batch.id}/rows`), '/api/imports/{id}/rows');
    const reviewed = await responseContract(await request(`/api/imports/${batch.id}/review`, { expectedVersion: details.version, blocks: [{ id: details.blocks[0].id, financialAccountId: bank.id }] }, 'PATCH'), '/api/imports/{id}/review', 'patch');
    await responseContract(await request(`/api/imports/${batch.id}/confirmation-preview`), '/api/imports/{id}/confirmation-preview');
    await responseContract(await request(`/api/imports/${batch.id}/confirm`, { expectedVersion: reviewed.version }), '/api/imports/{id}/confirm', 'post');
    await responseContract(await request(`/api/entries?kind=bank&accountId=${bank.id}`), '/api/entries');
    const file = await request(`/api/imports/${batch.id}/file`); expect(file.status).toBe(200); expect(file.headers.get('content-type')).toContain('application/octet-stream');
    const conflict = await request(`/api/imports/${batch.id}/review`, { expectedVersion: reviewed.version, all: { selected: false } }, 'PATCH'); expect(conflict.status).toBe(409); await responseContract(conflict, '/api/imports/{id}/review', 'patch');
  });
  it('disables docs in production by default and requires live session for explicit opt-in including assets', async () => {
    await app.close();
    app = await createApp({ ...config(), production: true, publicOrigin: 'https://rovere.test' }); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
    for (const path of ['/api/docs', '/api/openapi.json', '/api/docs/swagger-ui-bundle.js']) expect((await request(path)).status).toBe(404);
    await app.close();
    app = await createApp({ ...config(), production: true, publicOrigin: 'https://rovere.test', apiDocsEnabled: true }); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
    for (const path of ['/api/docs', '/api/openapi.json', '/api/docs/swagger-ui-bundle.js']) expect((await request(path, undefined, 'GET', { Cookie: '' })).status).toBe(401);
    // Native HTTP harness explicitly supplies the Secure cookie; public production requires HTTPS.
    const secureCookie = cookie.replace('better-auth.session_token=', '__Secure-better-auth.session_token=');
    const schema = await request('/api/openapi.json', undefined, 'GET', { Cookie: secureCookie }); expect(schema.status).toBe(200);
    expect((await schema.json()).components.securitySchemes.sessionCookie.name).toBe('__Secure-better-auth.session_token');
    expect((await request('/api/docs/swagger-ui-bundle.js', undefined, 'GET', { Cookie: secureCookie })).status).toBe(200);
    await db.$disconnect();
    const ownerDb = createDatabase(database.url);
    try { await ownerDb.session.deleteMany(); } finally { await ownerDb.$disconnect(); }
    expect((await request('/api/openapi.json', undefined, 'GET', { Cookie: secureCookie })).status).toBe(401);
  });
});
