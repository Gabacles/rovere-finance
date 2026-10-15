import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { expect, it } from 'vitest';
import { createDatabase } from '../src/database.js';
import { closeTestDatabase, testDatabase } from '../../../scripts/test-database.mjs';

it('RF-029 upgrades manual incomes without changing facts, receipts, versions or history', async () => {
  const harness = await testDatabase(); const target = new URL(harness.url); const schema = `rf013_${randomUUID().replaceAll('-', '')}`; target.searchParams.set('schema', schema);
  const db = createDatabase(target.href); const pool = new pg.Pool({ connectionString: target.href, options: `-c search_path=${schema}` });
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const names = (await readdir('apps/api/prisma/migrations')).filter(name => /^\d+_/.test(name)).sort();
    for (const name of names.filter(name => name < '202610150001_income_recurrences')) await pool.query(await readFile(`apps/api/prisma/migrations/${name}/migration.sql`, 'utf8'));
    const userId = randomUUID(); const decisionId = randomUUID(); const evidence = { kind: 'user', decisionId };
    await db.user.create({ data: { id: userId, name: 'Pessoa fictícia', email: `${userId}@rovere.test` } });
    const income = await db.income.create({ data: { userId, description: 'Previsão anterior', expectedOn: new Date('2024-02-29'), expectedAmount: 9223372036854775807n, origin: { kind: 'manual', decisionId }, factEvidence: { expectedOn: evidence, expectedAmount: evidence } } });
    await db.incomeCommand.create({ data: { id: decisionId, incomeId: income.id, userId, key: randomUUID(), requestHash: 'a'.repeat(64), version: 0, changes: { action: 'create' }, result: { original: true } } });
    const account = await db.financialAccount.create({ data: { userId, name: 'Banco fictício' } });
    const entry = await db.bankEntry.create({ data: { userId, accountId: account.id, cents: 1n, description: 'Entrada anterior', postedOn: new Date('2024-02-29'), fingerprint: 'b'.repeat(64) } });
    await db.bankEntryConfirmation.create({ data: { bankEntryId: entry.id, accountId: account.id, userId, direction: 'inflow', originalCents: 1n, confirmedCents: 1n, evidence } });
    await db.incomeSettlement.create({ data: { incomeId: income.id, bankEntryId: entry.id, accountId: account.id, userId, cents: 1n, evidence } });
    const snapshots = await Promise.all([db.income.findMany(), db.incomeCommand.findMany(), db.incomeSettlement.findMany(), db.bankEntryConfirmation.findMany()]);
    await pool.query(await readFile('apps/api/prisma/migrations/202610150001_income_recurrences/migration.sql', 'utf8'));
    expect(await Promise.all([db.income.findMany(), db.incomeCommand.findMany(), db.incomeSettlement.findMany(), db.bankEntryConfirmation.findMany()])).toEqual(snapshots);
    expect(await db.recurrenceRule.count()).toBe(0); expect(await db.scheduledOccurrence.count()).toBe(0);
  } finally { await db.$disconnect(); await pool.end(); await closeTestDatabase(target.href); await harness.close(); }
});
