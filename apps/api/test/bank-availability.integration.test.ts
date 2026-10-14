import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/database.js';
import { bankSource, confirmBankSource } from '../src/accounts/bank-availability.js';
import { testDatabase } from '../../../scripts/test-database.mjs';

let database: Awaited<ReturnType<typeof testDatabase>>; let db: ReturnType<typeof createDatabase>;
const owner = randomUUID(); const foreign = randomUUID(); let accountId: string;
const money = (cents: string) => ({ currency: 'BRL' as const, cents });
async function entry() { return db.bankEntry.create({ data: { userId: owner, accountId, postedOn: new Date('2026-10-14T00:00:00Z'), description: 'Movimento fictício para disponibilidade', cents: 10001n, fingerprint: 'b'.repeat(64) } }); }
async function confirm(id: string, direction: 'inflow' | 'outflow', userId = owner) {
  return db.$transaction(async tx => { await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`; await confirmBankSource(tx, userId, id, direction, money('10001'), randomUUID()); return bankSource(tx, userId, id); });
}
beforeAll(async () => {
  database = await testDatabase(); db = createDatabase(database.url);
  for (const id of [owner, foreign]) await db.user.create({ data: { id, name: 'Pessoa fictícia', email: `${id}@rovere.test` } });
  accountId = (await db.financialAccount.create({ data: { userId: owner, name: 'Conta fictícia' } })).id;
});
afterAll(async () => { await db?.$disconnect(); await database?.close(); });
describe('RF-028 shared bank confirmation infrastructure', () => {
  it('retains raw sign and explicit direction, rejects conflicting concurrent directions', async () => {
    const bank = await entry();
    const results = await Promise.allSettled([confirm(bank.id, 'inflow'), confirm(bank.id, 'outflow')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const value = await db.$transaction(tx => bankSource(tx, owner, bank.id));
    expect(value.amount.cents).toBe('10001'); expect(value.available).toEqual({ state: 'available', amount: money('10001') });
    expect(await db.bankEntryConfirmation.count({ where: { bankEntryId: bank.id } })).toBe(1);
    const confirmation = await db.bankEntryConfirmation.findUniqueOrThrow({ where: { bankEntryId: bank.id } });
    await expect(db.bankEntryConfirmation.update({ where: { bankEntryId: bank.id }, data: { direction: 'inflow' } })).rejects.toThrow();
    await expect(db.bankEntryConfirmation.delete({ where: { bankEntryId: bank.id } })).rejects.toThrow();
    expect((await db.bankEntry.findUniqueOrThrow({ where: { id: bank.id } })).cents).toBe(bank.cents);
    await expect(confirm(bank.id, confirmation.direction === 'inflow' ? 'outflow' : 'inflow')).rejects.toThrow();
  });
  it('preserves old payment source evidence through the compatibility trigger and composite FK', async () => {
    const bank = await entry(); const evidence = { kind: 'user', decisionId: randomUUID() };
    await db.statementPaymentSource.create({ data: { bankEntryId: bank.id, userId: owner, accountId, originalCents: bank.cents, confirmedCents: 10001n, evidence } });
    const confirmation = await db.bankEntryConfirmation.findUniqueOrThrow({ where: { bankEntryId: bank.id } });
    expect(confirmation).toMatchObject({ direction: 'outflow', originalCents: bank.cents, confirmedCents: 10001n, evidence });
    await expect(confirm(bank.id, 'inflow')).rejects.toThrow();
    const incoming = await entry(); await confirm(incoming.id, 'inflow');
    await expect(db.statementPaymentSource.create({ data: { bankEntryId: incoming.id, userId: owner, accountId, originalCents: incoming.cents, confirmedCents: 10001n, evidence } })).rejects.toThrow();
    expect(await db.statementPaymentSource.findUnique({ where: { bankEntryId: incoming.id } })).toBeNull();
  });
  it('isolates owners, validates SQL magnitude and marks changed origins unavailable without erasing proof', async () => {
    const bank = await entry(); await confirm(bank.id, 'inflow');
    await expect(confirm(bank.id, 'inflow', foreign)).rejects.toThrow();
    await expect(db.$transaction(tx => bankSource(tx, foreign, bank.id))).rejects.toThrow();
    await db.bankEntry.update({ where: { id: bank.id }, data: { cents: 20000n } });
    const changed = await db.$transaction(tx => bankSource(tx, owner, bank.id)); expect(changed.current).toBe(false); expect(changed.available.state).toBe('unknown'); expect(changed.confirmation?.amount.cents).toBe('10001');
    await expect(confirm(bank.id, 'inflow')).rejects.toThrow();
    const fresh = await entry();
    for (const extra of [{ userId: foreign }, { confirmedCents: 0n }, { confirmedCents: 10000n }, { direction: 'guessed' }, { evidence: {} }]) await expect(db.bankEntryConfirmation.create({ data: { bankEntryId: fresh.id, accountId, userId: owner, direction: 'inflow', originalCents: fresh.cents, confirmedCents: 10001n, evidence: { kind: 'user', decisionId: randomUUID() }, ...extra } })).rejects.toThrow();
  });
});
