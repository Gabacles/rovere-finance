import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { expect, it } from 'vitest';
import { createDatabase } from '../src/database.js';
import { ExpensesService } from '../src/expenses/expenses.service.js';
import { IncomeRecurrencesService } from '../src/incomes/recurrences.service.js';
import { closeTestDatabase, testDatabase } from '../../../scripts/test-database.mjs';

it('RF-031 upgrade adds empty typed forecasts without rewriting any existing table, expense evidence or replay result', async () => {
  const harness = await testDatabase(); const target = new URL(harness.url); const schema = `rf013_${randomUUID().replaceAll('-', '')}`; target.searchParams.set('schema', schema);
  const db = createDatabase(target.href); const pool = new pg.Pool({ connectionString: target.href, options: `-c search_path=${schema}` });
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`); const names = (await readdir('apps/api/prisma/migrations')).filter(name => /^\d+_/.test(name)).sort();
    for (const name of names.filter(name => name < '202610150003_expense_recurrences')) await pool.query(await readFile(`apps/api/prisma/migrations/${name}/migration.sql`, 'utf8'));
    const userId = randomUUID(); await db.user.create({ data: { id: userId, name: 'Upgrade fictício', email: `${userId}@rovere.test` } });
    const expenses = new ExpensesService(db); const body = { description: 'Despesa anterior', facts: { purchasedOn: '2026-10-01', total: { currency: 'BRL', cents: '9223372036854775807' } } }; const token = randomUUID(); const original = await expenses.create(userId, body, token);
    const current = await expenses.update(userId, original.id, { expectedVersion: 0, notes: 'Correção manual anterior' }, randomUUID());
    const incomes = new IncomeRecurrencesService(db); const rule = await incomes.create(userId, { description: 'Receita anterior', amount: { currency: 'BRL', cents: '1' }, anchorDay: 31, startsOn: '2024-01-01', endsOn: null }, randomUUID()) as any;
    const preview = await incomes.preview(userId, rule.id, { fromPeriod: '2024-02', toPeriod: '2024-03' }); await incomes.generate(userId, rule.id, { ...preview.range, expectedVersion: preview.rule.version, previewHash: preview.previewHash, generationConfirmed: true }, randomUUID());
    const tables = (await pool.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename', [schema])).rows.map(row => row.tablename as string);
    const snapshots = new Map<string, unknown>(); for (const table of tables) snapshots.set(table, (await pool.query(`SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows);
    await pool.query(await readFile('apps/api/prisma/migrations/202610150003_expense_recurrences/migration.sql', 'utf8'));
    for (const table of tables) expect((await pool.query(`SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows, table).toEqual(snapshots.get(table));
    expect(await expenses.get(userId, original.id)).toEqual(current); expect(await expenses.create(userId, body, token)).toEqual(original);
    expect(await db.expenseRecurrence.count()).toBe(0); expect(await db.expenseOccurrence.count()).toBe(0); expect(await db.expenseRecurrenceRevision.count()).toBe(0); expect(await db.expenseRecurrenceCommand.count()).toBe(0);
  } finally { await db.$disconnect(); await pool.end(); await closeTestDatabase(target.href); await harness.close(); }
});
