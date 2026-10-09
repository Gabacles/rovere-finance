import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createDatabase } from '../../apps/api/dist/database.js';

// All journeys share one loopback peer; each test gets fresh database-backed auth counters.
// Production limits stay exercised by RF-013 integration tests.
export const test = base.extend<{ authCounters: void }>({
  authCounters: [async ({}, use) => {
    const { url } = JSON.parse(await readFile('.tmp-e2e-database.json', 'utf8')) as { url: string };
    const target = new URL(url);
    if (target.pathname !== '/rovere_test' || !/^rf013_[a-f0-9]{32}$/.test(target.searchParams.get('schema') ?? '')) throw new Error('Unsafe E2E database');
    const db = createDatabase(url);
    try { await db.rateLimit.deleteMany(); await use(); } finally { await db.$disconnect(); }
  }, { auto: true }],
});
export { expect };
