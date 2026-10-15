import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { ImportWorker } from '../src/imports/worker.js';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { mailLink } from '../../../scripts/test-mail.mjs';
import { contractValidator } from './openapi-validator.js';

const origin = 'http://127.0.0.1:18080';
let database: Awaited<ReturnType<typeof testDatabase>>; let db: ReturnType<typeof createDatabase>; let app: Awaited<ReturnType<typeof createApp>>; let base: string;
let alice: { id: string; cookie: string }; let bob: typeof alice; let account: { id: string }; let credit: { id: string }; let period = 0;
let validate: ReturnType<typeof contractValidator>;
const money = (cents: string) => ({ currency: 'BRL', cents }); const path = (id: string) => `/incomes/${id}/settlements`;
const config = () => ({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: origin, smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false, importsWorkerEnabled: false });
function request(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', cookie = alice?.cookie ?? '', extra = {}) {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function register(name: string) {
  const email = `${name}-${randomUUID()}@rovere.test`; const password = 'Fictitious-receipt-123!'; const signup = await request('/auth/sign-up/email', { name, email, password }); expect(signup.status).toBe(200); const user = (await signup.json()).user;
  const url = new URL(await mailLink(email, 'Confirme')); await fetch(`${base}${url.pathname}${url.search}`, { redirect: 'manual' });
  const login = await request('/auth/sign-in/email', { email, password }); expect(login.status).toBe(200); return { id: user.id, cookie: login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
async function income(cents: string | null = '10001', owner = alice) { const response = await request('/incomes', { description: 'Receita fictícia', facts: { expectedAmount: cents === null ? null : money(cents) } }, 'POST', owner.cookie); expect(response.status).toBe(201); return response.json(); }
async function bank(cents = '10001', owner = alice, target = account) { return db.bankEntry.create({ data: { userId: owner.id, accountId: target.id, cents: BigInt(cents), postedOn: new Date('2026-11-08T00:00:00Z'), description: 'Movimento fictício', fingerprint: randomUUID().replaceAll('-', '').padEnd(64, '0') } }); }
async function summary(id: string) { const response = await request(path(id)); expect(response.status).toBe(200); const data = await response.json(); expect(validate(data), JSON.stringify(validate.errors)).toBe(true); return data; }
async function source(id: string) { return (await request(`/bank-entries/${id}/settlement-source`)).json(); }
async function body(id: string, bankId: string, cents = '10001') { const value = await summary(id); const row = await source(bankId); const raw = BigInt(row.amount.cents); return { expectedVersion: value.income.version, bankEntryId: bankId, expectedBankVersion: row.version, confirmedInflow: money(String(raw < 0n ? -raw : raw)), inflowConfirmed: true, amount: money(cents) }; }
async function allocate(id: string, bankId: string, cents = '10001') { const response = await request(path(id), await body(id, bankId, cents)); expect(response.status).toBe(201); const value = await response.json(); expect(validate(value), JSON.stringify(validate.errors)).toBe(true); return value; }
async function stmt() {
  const row = await db.statement.create({ data: { userId: alice.id, creditAccountId: credit.id, period: `2027-${String(++period).padStart(2, '0')}`, creationKey: randomUUID() } });
  const route = `/credit-accounts/${credit.id}/statements/${row.id}`;
  expect((await request(route, { expectedVersion: 0, facts: { declaredTotal: money('10001') } }, 'PATCH')).status).toBe(200);
  const state = await (await request(`${route}/payments`)).json(); const candidate = state.candidates.declared;
  expect((await request(`${route}/payments/basis`, { expectedStatementVersion: state.statementVersion, kind: 'declared', referenceHash: candidate.referenceHash, beforePaymentsConfirmed: true, independentObligationConfirmed: true })).status).toBe(201);
  const current = await (await request(`${route}/payments`)).json(); return { route: `${route}/payments`, version: current.statementVersion };
}
async function importBank(format: 'csv' | 'ofx', id: string, target = account) {
  const configuration = format === 'ofx' ? {} : { profile: { id: 'income-fixture', encoding: 'utf-8', delimiter: ';', headerLine: 1, dateFormat: 'YMD', decimal: '.', grouping: null, sign: 'as-is', currency: 'BRL', kind: 'bank', columns: { date: 'Date', description: 'Description', amount: 'Amount', externalId: 'ID' } } };
  const content = format === 'csv' ? `Date;Description;Amount;ID\n2026-11-08;Recebimento fictício;100.01;${id}` : (await readFile('packages/importers/test/fixtures/bank-102.ofx', 'utf8')).replace('<TRNAMT>-120.00', '<TRNAMT>100.01').replace('<FITID>0001', `<FITID>${id}`);
  const form = new FormData(); form.append('format', format); form.append('configuration', JSON.stringify(configuration)); form.append('file', new Blob([content]), `income.${format}`);
  const upload = await fetch(`${base}/api/imports`, { method: 'POST', headers: { Origin: origin, Cookie: alice.cookie, 'Idempotency-Key': randomUUID() }, body: form }); expect(upload.status).toBe(201);
  const batch = await upload.json(); await app.get(ImportWorker).runOnce(); const current = await (await request(`/imports/${batch.id}`)).json();
  const saved = await (await request(`/imports/${batch.id}/review`, { expectedVersion: current.version, blocks: [{ id: current.blocks[0].id, financialAccountId: target.id }] }, 'PATCH')).json();
  expect((await request(`/imports/${batch.id}/confirm`, { expectedVersion: saved.version })).status).toBe(201);
  return db.bankEntry.findFirstOrThrow({ where: { identities: { some: { externalId: id } } } });
}
beforeAll(async () => {
  database = await testDatabase(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  alice = await register('ReceiptAlice'); bob = await register('ReceiptBob'); account = await (await request('/accounts', { name: 'Banco fictício' })).json(); credit = await (await request('/credit-accounts', { name: 'Crédito fictício' })).json();
  validate = contractValidator(JSON.parse(await readFile('docs/api/openapi.json', 'utf8')), { $ref: '#/components/schemas/IncomeSettlements' });
});
afterAll(async () => { await app?.close(); await database?.close(); });

describe('RF-028 explicit income settlements and shared bank reservations', () => {
  it('requires known expected amount, protects cancellation and distinguishes zero without synthetic cash', async () => {
    const unknown = await income(null); const zero = await income('0'); const cancelled = await income(); const movement = await bank();
    expect((await request(`/incomes/${cancelled.id}/cancel`, { expectedVersion: 0 })).status).toBe(201);
    for (const item of [unknown, zero, cancelled]) expect((await request(path(item.id), await body(item.id, movement.id, '1'))).status).toBe(409);
    expect((await summary(unknown.id)).progress.state).toBe('unknown'); expect((await summary(zero.id)).progress.state).toBe('no_expected_amount');
    expect((await source(movement.id)).confirmation).toBeNull(); expect(await db.incomeSettlement.count()).toBe(0);
  });
  it('allocates partial/multiple movements exactly and leaves differences pending without creating financial facts', async () => {
    const item = await income(); const a = await bank('3334'); const b = await bank('-6667'); const count = await db.bankEntry.count();
    const partial = await allocate(item.id, a.id, '3334'); expect(partial.progress).toMatchObject({ state: 'partial', received: money('3334'), pending: { amount: money('6667') }, difference: { amount: money('-6667') } });
    const full = await allocate(item.id, b.id, '6667'); expect(full.progress.state).toBe('received'); expect(full.progress.pending.amount.cents).toBe('0'); expect(full.allocations.rows.every((row: any) => row.postedOn === '2026-11-08')).toBe(true);
    expect(full.income.facts.expectedOn).toEqual({ state: 'unknown' }); expect((await db.bankEntry.findUniqueOrThrow({ where: { id: b.id } })).cents).toBe(-6667n);
    expect(await db.bankEntry.count()).toBe(count); expect(await db.expense.count()).toBe(0); expect(await db.cardCharge.count()).toBe(0);
  });
  it('splits one movement across recipes, refuses source/destination excess and allows explicit forecast revision', async () => {
    const a = await income('6000'); const b = await income('8000'); const movement = await bank(); await allocate(a.id, movement.id, '6000');
    expect((await request(path(b.id), await body(b.id, movement.id, '4002'))).status).toBe(409); await allocate(b.id, movement.id, '4001'); expect((await source(movement.id)).allocated.cents).toBe('10001');
    const c = await income('1000'); const other = await bank('2000'); expect((await request(path(c.id), await body(c.id, other.id, '1001'))).status).toBe(409); expect((await source(other.id)).confirmation).toBeNull();
    expect((await request(`/incomes/${c.id}`, { expectedVersion: 0, facts: { expectedAmount: money('1500') } }, 'PATCH')).status).toBe(200);
    await allocate(c.id, other.id, '1500'); expect((await source(other.id)).available.amount.cents).toBe('500');
  });
  it('serializes two destinations for the same source and two sources for the same income', async () => {
    const a = await income(); const b = await income(); const movement = await bank(); const bodies = await Promise.all([body(a.id, movement.id, '6000'), body(b.id, movement.id, '6000')]);
    const responses = await Promise.all([request(path(a.id), bodies[0]), request(path(b.id), bodies[1])]); expect(responses.map(row => row.status).sort()).toEqual([201, 409]);
    const loser = responses[0]!.status === 409 ? a : b; expect((await request(path(loser.id), await body(loser.id, movement.id, '6000'))).status).toBe(409); expect((await source(movement.id)).allocated.cents).toBe('6000');
    const c = await income(); const x = await bank('6000'); const y = await bank('6000'); const choices = await Promise.all([body(c.id, x.id, '6000'), body(c.id, y.id, '6000')]);
    const attempts = await Promise.all(choices.map(choice => request(path(c.id), choice))); expect(attempts.map(row => row.status).sort()).toEqual([201, 409]); expect((await summary(c.id)).progress.received.cents).toBe('6000');
  });
  it('serializes invoice versus income and refuses incompatible direction even with fresh versions', async () => {
    const item = await income(); const invoice = await stmt(); const movement = await bank(); const receipt = await body(item.id, movement.id, '6000');
    const payment = { expectedStatementVersion: invoice.version, bankEntryId: movement.id, expectedBankVersion: 0, confirmedOutflow: money('10001'), outflowConfirmed: true, amount: money('6000') };
    const responses = await Promise.all([request(path(item.id), receipt), request(invoice.route, payment)]); expect(responses.map(row => row.status).sort()).toEqual([201, 409]);
    if (responses[0]!.status === 201) expect((await request(invoice.route, { ...payment, expectedBankVersion: (await source(movement.id)).version })).status).toBe(409);
    else expect((await request(path(item.id), await body(item.id, movement.id, '1'))).status).toBe(409);
    expect((await source(movement.id)).allocated.cents).toBe('6000');
    const paymentView = await (await request(`/bank-entries/${movement.id}/payment-source`)).json(); expect(paymentView.allocated.cents).toBe('6000');
  });
  it('protects editing/cancellation and serializes edits against receiving', async () => {
    const item = await income(); const movement = await bank(); const current = await allocate(item.id, movement.id, '6000');
    for (const facts of [{ expectedAmount: null }, { expectedAmount: money('5999') }]) expect((await request(`/incomes/${item.id}`, { expectedVersion: current.income.version, facts }, 'PATCH')).status).toBe(409);
    expect((await request(`/incomes/${item.id}/cancel`, { expectedVersion: current.income.version })).status).toBe(409);
    expect((await request(`/incomes/${item.id}`, { expectedVersion: current.income.version, notes: 'Correção manual preservada' }, 'PATCH')).status).toBe(200); expect((await summary(item.id)).progress.received.cents).toBe('6000');
    const other = await income(); const second = await bank(); const decision = await body(other.id, second.id, '6000');
    const responses = await Promise.all([request(path(other.id), decision), request(`/incomes/${other.id}`, { expectedVersion: 0, facts: { expectedAmount: money('5000') } }, 'PATCH')]);
    expect(responses.filter(row => row.status === 409)).toHaveLength(1); expect(responses.filter(row => [200, 201].includes(row.status))).toHaveLength(1);
    const third = await income(); const last = await bank(); const receipt = await body(third.id, last.id, '6000');
    const cancellation = await Promise.all([request(path(third.id), receipt), request(`/incomes/${third.id}/cancel`, { expectedVersion: 0 })]);
    expect(cancellation.map(row => row.status).sort()).toEqual([201, 409]);
  });
  it('recovers original allocation/reversal responses after subsequent edits and restart with one journal version', async () => {
    const item = await income(); const movement = await bank(); const decision = await body(item.id, movement.id, '6000'); const headers = { 'Idempotency-Key': randomUUID() };
    const attempts = await Promise.all([request(path(item.id), decision, 'POST', alice.cookie, headers), request(path(item.id), decision, 'POST', alice.cookie, headers)]);
    expect(attempts.map(row => row.status)).toEqual([201, 201]); const first = await attempts[0]!.json(); expect(await attempts[1]!.json()).toEqual(first);
    const allocation = first.allocations.rows[0]; const reverseBody = { expectedVersion: first.income.version, expectedBankVersion: first.bankEntry.version, reversalConfirmed: true }; const reverseHeaders = { 'Idempotency-Key': randomUUID() };
    const reversed = await (await request(`${path(item.id)}/${allocation.id}/reverse`, reverseBody, 'POST', alice.cookie, reverseHeaders)).json(); expect(reversed.progress.state).toBe('unreceived'); expect(reversed.bankEntry.available.amount.cents).toBe('10001');
    expect((await request(`/incomes/${item.id}`, { expectedVersion: reversed.income.version, notes: 'Depois da reversão' }, 'PATCH')).status).toBe(200);
    await app.close(); db = createDatabase(database.url); app = await createApp(config(), db); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
    expect(await (await request(path(item.id), decision, 'POST', alice.cookie, headers)).json()).toEqual(first);
    expect(await (await request(`${path(item.id)}/${allocation.id}/reverse`, reverseBody, 'POST', alice.cookie, reverseHeaders)).json()).toEqual(reversed);
    expect((await request(path(item.id), { ...decision, amount: money('6001') }, 'POST', alice.cookie, headers)).status).toBe(409);
    expect((await request(`${path(item.id)}/${allocation.id}/reverse`, { ...reverseBody, expectedVersion: 3, expectedBankVersion: 2 })).status).toBe(409);
    expect(await db.incomeSettlement.count({ where: { incomeId: item.id } })).toBe(1); expect(await db.incomeCommand.count({ where: { incomeId: item.id } })).toBe(4);
    expect((await request(`/incomes/${item.id}/cancel`, { expectedVersion: 3 })).status).toBe(201);
  });
  it('rolls back confirmation, reservation, both versions and journal on allocation/reversal journal failure', async () => {
    const item = await income(); const movement = await bank(); const decision = await body(item.id, movement.id, '6000');
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_receipt_command() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictitious journal failure'; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER test_receipt_failure BEFORE INSERT ON "IncomeCommand" FOR EACH ROW EXECUTE FUNCTION reject_receipt_command()`);
    try { expect((await request(path(item.id), decision)).status).toBe(500); } finally { await db.$executeRawUnsafe('DROP TRIGGER test_receipt_failure ON "IncomeCommand"'); }
    expect((await source(movement.id)).confirmation).toBeNull(); expect((await source(movement.id)).version).toBe(0); expect((await summary(item.id)).income.version).toBe(0);
    const allocated = await allocate(item.id, movement.id, '6000'); const row = allocated.allocations.rows[0];
    await db.$executeRawUnsafe(`CREATE TRIGGER test_receipt_failure BEFORE INSERT ON "IncomeCommand" FOR EACH ROW EXECUTE FUNCTION reject_receipt_command()`);
    try { expect((await request(`${path(item.id)}/${row.id}/reverse`, { expectedVersion: allocated.income.version, expectedBankVersion: allocated.bankEntry.version, reversalConfirmed: true })).status).toBe(500); }
    finally { await db.$executeRawUnsafe('DROP TRIGGER test_receipt_failure ON "IncomeCommand"'); await db.$executeRawUnsafe('DROP FUNCTION reject_receipt_command()'); }
    expect((await summary(item.id)).progress.received.cents).toBe('6000'); expect((await source(movement.id)).version).toBe(1); expect(await db.incomeCommand.count({ where: { incomeId: item.id } })).toBe(2);
  });
  it('isolates sessions/owners, composite SQL references, immutable records and direction', async () => {
    const item = await income(); const movement = await bank(); const foreignIncome = await income('10001', bob); const foreignAccount = await (await request('/accounts', { name: 'Banco Bob' }, 'POST', bob.cookie)).json(); const foreignBank = await bank('10001', bob, foreignAccount);
    for (const endpoint of [path(item.id), `/bank-entries/${movement.id}/settlement-source`]) { expect((await request(endpoint, undefined, 'GET', bob.cookie)).status).toBe(404); expect((await request(endpoint, undefined, 'GET', '')).status).toBe(401); }
    const decision = await body(item.id, movement.id, '6000'); expect((await request(path(item.id), decision, 'POST', bob.cookie)).status).toBe(404);
    expect((await request(path(item.id), { ...decision, bankEntryId: foreignBank.id })).status).toBe(404); expect((await request(path(item.id), decision, 'POST', '')).status).toBe(401);
    const allocated = await allocate(item.id, movement.id, '6000'); const row = await db.incomeSettlement.findUniqueOrThrow({ where: { id: allocated.allocations.rows[0].id } });
    await expect(db.incomeSettlement.create({ data: { ...row, id: randomUUID(), incomeId: foreignIncome.id } })).rejects.toThrow();
    await expect(db.incomeSettlement.update({ where: { id: row.id }, data: { cents: 1n } })).rejects.toThrow(); await expect(db.incomeSettlement.delete({ where: { id: row.id } })).rejects.toThrow();
    for (const invalid of [{ cents: 0n }, { cents: -1n }, { direction: 'outflow' }, { evidence: {} }]) await expect(db.incomeSettlement.create({ data: { ...row, id: randomUUID(), ...invalid } })).rejects.toThrow();
    expect((await request(`${path(item.id)}/${row.id}/reverse`, { expectedVersion: 1, expectedBankVersion: 1, reversalConfirmed: true }, 'POST', bob.cookie)).status).toBe(404);
    expect((await request(`${path(item.id)}/${row.id}/reverse`, { expectedVersion: 1, expectedBankVersion: 1, reversalConfirmed: true }, 'POST', '')).status).toBe(401);
  });
  it('validates money/extra fields/versions/confirmations/keys/origin/JSON and history contracts', async () => {
    const item = await income(); const movement = await bank(); const decision = await body(item.id, movement.id, '1');
    for (const invalid of [{ ...decision, userId: bob.id }, { ...decision, inflowConfirmed: false }, { ...decision, expectedVersion: -1 }, { ...decision, expectedBankVersion: 2147483647 }, ...['0', '-1', '1.2', '1e3', '9223372036854775808'].map(cents => ({ ...decision, amount: money(cents) }))]) expect((await request(path(item.id), invalid)).status).toBe(400);
    expect((await request(path(item.id), { ...decision, confirmedInflow: money('10000') })).status).toBe(400);
    expect((await request(path(item.id), decision, 'POST', alice.cookie, { 'Idempotency-Key': '' })).status).toBe(400); expect((await request(path(item.id), decision, 'POST', alice.cookie, { Origin: 'https://attacker.test' })).status).toBe(403);
    const allocated = await allocate(item.id, movement.id, '1'); const row = allocated.allocations.rows[0]; const reverse = { expectedVersion: 1, expectedBankVersion: 1, reversalConfirmed: true };
    expect((await request(`${path(item.id)}/${row.id}/reverse`, { ...reverse, reversalConfirmed: false })).status).toBe(400);
    const history = await (await request(`/incomes/${item.id}/history`)).json(); const document = JSON.parse(await readFile('docs/api/openapi.json', 'utf8'));
    const historyValidator = contractValidator(document, { $ref: '#/components/schemas/IncomeHistory' }); expect(historyValidator(history), JSON.stringify(historyValidator.errors)).toBe(true);
    const sourceValidator = contractValidator(document, { $ref: '#/components/schemas/BankSettlementSource' }); expect(sourceValidator(await source(movement.id))).toBe(true);
    for (const endpoint of [path(item.id), `/bank-entries/${movement.id}/settlement-source`]) {
      const malformed = await fetch(`${base}/api${endpoint}`, { method: 'POST', headers: { Origin: origin, Cookie: alice.cookie, 'Content-Type': 'application/json' }, body: '{"private":"fictitious-value"' }); expect(malformed.status).toBe(400); expect(await malformed.text()).not.toContain('fictitious-value');
    }
    expect((await request(`${path(item.id)}?page=0`)).status).toBe(400);
  });
  it.each(['csv', 'ofx'] as const)('preserves settlement/origin/manual edits through %s reimport', async format => {
    const id = randomUUID(); const movement = await importBank(format, id); const item = await income(); const allocated = await allocate(item.id, movement.id, '3334');
    expect((await request(`/incomes/${item.id}`, { expectedVersion: allocated.income.version, notes: 'Anotação manual preservada' }, 'PATCH')).status).toBe(200);
    const before = await summary(item.id); const count = await db.bankEntry.count(); await importBank(format, id);
    expect(await db.bankEntry.count()).toBe(count); expect(await summary(item.id)).toEqual(before); expect((await source(movement.id)).allocated.cents).toBe('3334');
  });
  it('paginates settlements, supports BIGINT max and exposes changed source as review required', async () => {
    const item = await income('9223372036854775807'); const large = await bank('9223372036854775807'); const full = await allocate(item.id, large.id, '9223372036854775807'); expect(full.progress.state).toBe('received');
    await db.bankEntry.update({ where: { id: large.id }, data: { cents: 1n } }); expect((await summary(item.id)).progress.state).toBe('review_required'); expect((await source(large.id)).available.state).toBe('unknown');
    const normal = await income('100'); const movement = await bank('100'); for (let i = 0; i < 26; i++) await allocate(normal.id, movement.id, '1');
    expect((await summary(normal.id)).allocations.rows).toHaveLength(25); const second = await (await request(`${path(normal.id)}?page=2`)).json(); expect(second.allocations.rows).toHaveLength(1); expect(second.allocations.total).toBe(26);
  });
  it('settles and reverses an RF-029 occurrence without changing its schedule or duplicating imported CSV/OFX cash', async () => {
    const created = await (await request('/income-recurrences', { description: 'Recorrência fictícia liquidável', amount: money('20002'), anchorDay: 15, startsOn: '2026-11-01', endsOn: null })).json();
    const preview = await (await request(`/income-recurrences/${created.id}/preview`, { fromPeriod: '2026-11', toPeriod: '2026-11' })).json();
    const generated = await (await request(`/income-recurrences/${created.id}/generate`, { ...preview.range, expectedVersion: 0, previewHash: preview.previewHash, generationConfirmed: true })).json(); const id = generated.created[0].incomeId;
    const original = await (await request(`/incomes/${id}`)).json();
    const target = await (await request('/accounts', { name: 'Banco fictício da recorrência' })).json();
    const csv = await importBank('csv', `recurrence-csv-${randomUUID()}`, target); const ofx = await importBank('ofx', `recurrence-ofx-${randomUUID()}`, target); const count = await db.bankEntry.count();
    await allocate(id, csv.id); const received = await allocate(id, ofx.id); expect(received.progress.state).toBe('received'); expect(received.income.origin).toEqual(original.origin); expect(received.income.facts).toEqual(original.facts);
    const allocation = received.allocations.rows[0]; const bankVersion = (await source(allocation.bankEntryId)).version;
    const reversed = await request(`${path(id)}/${allocation.id}/reverse`, { expectedVersion: received.income.version, expectedBankVersion: bankVersion, reversalConfirmed: true }); expect(reversed.status).toBe(201); expect((await reversed.json()).progress.received.cents).toBe('10001');
    expect(await db.bankEntry.count()).toBe(count); const nextPreview = await (await request(`/income-recurrences/${created.id}/preview`, preview.range)).json(); expect(nextPreview.counts).toEqual({ create: 0, existing: 1, outsideRule: 0 });
  });
});
