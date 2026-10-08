import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Each suite owns one schema. Never migrate, truncate or drop the development database.
export async function testDatabase() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgresql://rovere:rovere_local_only@127.0.0.1:15432/rovere_test');
  if (url.pathname !== '/rovere_test') throw new Error('TEST_DATABASE_URL must target rovere_test');
  const adminUrl = new URL(url); adminUrl.pathname = '/postgres'; adminUrl.search = '';
  const admin = new pg.Pool({ connectionString: adminUrl.href });
  try {
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname = 'rovere_test'")).rowCount) {
      await admin.query('CREATE DATABASE rovere_test');
    }
  } finally { await admin.end(); }
  const schema = `rf013_${randomUUID().replaceAll('-', '')}`;
  url.searchParams.set('schema', schema);
  try {
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'apps/api/prisma.config.ts'], {
      env: { ...process.env, DATABASE_URL: url.href }, stdio: 'pipe',
    });
  } catch (error) { await closeTestDatabase(url.href); throw error; }
  return { url: url.href, close: () => closeTestDatabase(url.href) };
}

export async function closeTestDatabase(databaseUrl) {
  const url = new URL(databaseUrl); const schema = url.searchParams.get('schema');
  if (url.pathname !== '/rovere_test' || !/^rf013_[a-f0-9]{32}$/.test(schema ?? '')) throw new Error('Unsafe test schema');
  const pool = new pg.Pool({ connectionString: url.href });
  try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); }
}
