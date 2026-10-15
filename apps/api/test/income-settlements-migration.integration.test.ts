import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { expect, it } from 'vitest';
import { createDatabase } from '../src/database.js';
import { closeTestDatabase, testDatabase } from '../../../scripts/test-database.mjs';

it('RF-028 upgrades old payment sources without changing evidence, allocations or journal', async () => {
  const harness = await testDatabase(); const target = new URL(harness.url); const schema = `rf013_${randomUUID().replaceAll('-', '')}`;
  target.searchParams.set('schema', schema); const db = createDatabase(target.href);
  const pool = new pg.Pool({ connectionString: target.href, options: `-c search_path=${schema}` });
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const names = (await readdir('apps/api/prisma/migrations')).filter(name => /^\d+_/.test(name)).sort();
    for (const name of names.filter(name => name < '202610140002_income_settlements')) await pool.query(await readFile(`apps/api/prisma/migrations/${name}/migration.sql`, 'utf8'));
    const userId = randomUUID(); await db.user.create({ data: { id: userId, name: 'Pessoa fictícia do upgrade', email: `${userId}@rovere.test` } });
    const bank = await db.financialAccount.create({ data: { userId, name: 'Banco fictício do upgrade' } });
    const credit = await db.creditAccount.create({ data: { userId, name: 'Crédito fictício', creationKey: randomUUID() } });
    const statement = await db.statement.create({ data: { userId, creditAccountId: credit.id, period: '2026-11', creationKey: randomUUID() } });
    const entry = await db.bankEntry.create({ data: { userId, accountId: bank.id, cents: -10001n, description: 'Pagamento fictício anterior', postedOn: new Date('2026-11-01T00:00:00Z'), fingerprint: 'a'.repeat(64) } });
    const evidence = { kind: 'user', decisionId: randomUUID() };
    await pool.query('INSERT INTO "StatementPaymentSource" ("bankEntryId","accountId","userId","originalCents","confirmedCents","evidence") VALUES ($1,$2,$3,$4,$5,$6)', [entry.id, bank.id, userId, '-10001', '10001', evidence]);
    await db.statementPaymentBasis.create({ data: { statementId: statement.id, creditAccountId: credit.id, userId, kind: 'declared', total: 10001n, referenceHash: 'b'.repeat(64), evidence, snapshot: {} } });
    await db.statementPaymentAllocation.create({ data: { statementId: statement.id, creditAccountId: credit.id, userId, bankEntryId: entry.id, accountId: bank.id, cents: 3334n, evidence } });
    await db.statementPaymentCommand.create({ data: { statementId: statement.id, creditAccountId: credit.id, userId, bankEntryId: entry.id, accountId: bank.id, key: randomUUID(), requestHash: 'c'.repeat(64), changes: { fixture: 'before upgrade' }, result: { fixture: 'original result' } } });
    const beforeSource = (await pool.query('SELECT to_jsonb(s) AS value FROM "StatementPaymentSource" s')).rows;
    const allocations = await db.statementPaymentAllocation.findMany(); const journal = await db.statementPaymentCommand.findMany();
    await pool.query(await readFile('apps/api/prisma/migrations/202610140002_income_settlements/migration.sql', 'utf8'));
    const afterSource = (await pool.query('SELECT to_jsonb(s) - \'direction\' AS value FROM "StatementPaymentSource" s')).rows;
    expect(afterSource).toEqual(beforeSource); expect(await db.statementPaymentAllocation.findMany()).toEqual(allocations); expect(await db.statementPaymentCommand.findMany()).toEqual(journal);
    expect(await db.bankEntryConfirmation.findUniqueOrThrow({ where: { bankEntryId: entry.id } })).toMatchObject({ direction: 'outflow', originalCents: -10001n, confirmedCents: 10001n, evidence });
  } finally { await db.$disconnect(); await pool.end(); await closeTestDatabase(target.href); await harness.close(); }
});
