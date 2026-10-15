import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { expect, it } from 'vitest';
import { createDatabase } from '../src/database.js';
import { closeTestDatabase, testDatabase } from '../../../scripts/test-database.mjs';
import { normalizeIncomeRecurrence } from '@rovere/domain';
import { IncomeRecurrencesService } from '../src/incomes/recurrences.service.js';
import { contractValidator } from './openapi-validator.js';

it('RF-030 backfills initial schedules without rewriting RF-029 origins, occurrence snapshots, receipts or replay journals', async () => {
  const harness = await testDatabase(); const target = new URL(harness.url); const schema = `rf013_${randomUUID().replaceAll('-', '')}`; target.searchParams.set('schema', schema); const db = createDatabase(target.href); const pool = new pg.Pool({ connectionString: target.href, options: `-c search_path=${schema}` });
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`); const names = (await readdir('apps/api/prisma/migrations')).filter(name => /^\d+_/.test(name)).sort();
    for (const name of names.filter(name => name < '202610150002_recurrence_lifecycle')) await pool.query(await readFile(`apps/api/prisma/migrations/${name}/migration.sql`, 'utf8'));
    const userId = randomUUID(); const ruleId = randomUUID(); const incomeId = randomUUID(); const occurrenceId = randomUUID(); const decisionId = randomUUID(); const evidence = { kind: 'user', decisionId }; const origin = { kind: 'recurrence', ruleId, occurrenceId, decisionId };
    await db.user.create({ data: { id: userId, name: 'Upgrade fictício', email: `${userId}@rovere.test` } });
    await pool.query('INSERT INTO "RecurrenceRule" ("id","userId","description","cents","anchorDay","startsOn","evidence") VALUES ($1,$2,$3,$4,31,$5,$6)', [ruleId, userId, 'Regra anterior', '9223372036854775807', '2024-01-01', evidence]);
    const client = await pool.connect();
    try { await client.query('BEGIN'); await client.query('INSERT INTO "Income" ("id","userId","description","expectedOn","expectedAmount","origin","factEvidence","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())', [incomeId, userId, 'Receita anterior', '2024-02-29', '9223372036854775807', origin, { expectedOn: evidence, expectedAmount: evidence }]); await client.query('INSERT INTO "ScheduledOccurrence" ("id","userId","ruleId","period","expectedOn","cents","ruleVersion","incomeId","evidence") VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8)', [occurrenceId, userId, ruleId, '2024-02', '2024-02-29', '9223372036854775807', incomeId, evidence]); await client.query('COMMIT'); } finally { client.release(); }
    const originalInput = normalizeIncomeRecurrence({ description: 'Regra anterior', notes: null, amount: { currency: 'BRL', cents: '9223372036854775807' }, anchorDay: 31, startsOn: '2024-01-01', endsOn: null }); const originalKey = randomUUID();
    const originalResult = { ...originalInput, id: ruleId, version: 0, cadence: 'monthly', evidence, occurrenceCount: 0 };
    await db.recurrenceCommand.create({ data: { id: decisionId, ruleId, userId, key: originalKey, requestHash: createHash('sha256').update(JSON.stringify({ action: 'create', input: originalInput })).digest('hex'), version: 0, changes: { action: 'create', old: true }, result: originalResult } });
    await db.incomeCommand.create({ data: { incomeId, userId, key: randomUUID(), requestHash: 'b'.repeat(64), version: 0, changes: { action: 'generate' }, result: { id: incomeId } } });
    const account = await db.financialAccount.create({ data: { userId, name: 'Banco fictício anterior' } }); const bank = await db.bankEntry.create({ data: { userId, accountId: account.id, cents: 1n, postedOn: new Date('2024-02-29'), description: 'Entrada fictícia anterior', fingerprint: 'c'.repeat(64) } });
    await db.bankEntryConfirmation.create({ data: { userId, bankEntryId: bank.id, accountId: account.id, direction: 'inflow', originalCents: 1n, confirmedCents: 1n, evidence } }); await db.incomeSettlement.create({ data: { userId, incomeId, bankEntryId: bank.id, accountId: account.id, cents: 1n, evidence } });
    const tables = ['Income', 'ScheduledOccurrence', 'RecurrenceCommand', 'IncomeCommand', 'IncomeSettlement', 'BankEntry', 'BankEntryConfirmation']; const snapshots = [];
    for (const table of tables) snapshots.push((await pool.query(`SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows);
    const oldRule = (await pool.query('SELECT to_jsonb(t) AS value FROM "RecurrenceRule" t')).rows;
    await pool.query(await readFile('apps/api/prisma/migrations/202610150002_recurrence_lifecycle/migration.sql', 'utf8'));
    for (const [index, table] of tables.entries()) expect((await pool.query(`SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows).toEqual(snapshots[index]);
    expect((await pool.query('SELECT to_jsonb(t)-\'state\' AS value FROM "RecurrenceRule" t')).rows).toEqual(oldRule); const row = await db.recurrenceRule.findUniqueOrThrow({ where: { id: ruleId }, include: { schedules: true } }); expect(row.state).toBe('active'); expect(row.schedules).toHaveLength(1); expect(row.schedules[0]).toMatchObject({ effectiveFrom: '0001-01', version: 0, cents: 9223372036854775807n, anchorDay: 31, evidence }); expect(await db.recurrenceException.count()).toBe(0);
    const replay = await new IncomeRecurrencesService(db).create(userId, originalInput, originalKey); expect(replay).toEqual(originalResult);
    const document = JSON.parse(await readFile('docs/api/openapi.json', 'utf8')); const validate = contractValidator(document, { $ref: '#/components/schemas/IncomeRecurrence' }); expect(validate(replay), JSON.stringify(validate.errors)).toBe(true);
  } finally { await db.$disconnect(); await pool.end(); await closeTestDatabase(target.href); await harness.close(); }
});
