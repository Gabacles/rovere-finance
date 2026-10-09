import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { closeTestDatabase } from './test-database.mjs';
export default async function teardown() {
  const marker = '.tmp-e2e-database.json';
  if (!existsSync(marker)) return;
  const { url, stopToken } = JSON.parse(readFileSync(marker, 'utf8'));
  if (stopToken) {
    try {
      const response = await fetch('http://127.0.0.1:15173/__e2e__/stop-worker', { method: 'POST', headers: { 'X-E2E-Token': stopToken } });
      if (!response.ok) throw new Error('E2E worker did not stop');
    } catch (error) { if (error.cause?.code !== 'ECONNREFUSED') throw error; }
  }
  await closeTestDatabase(url);
  unlinkSync(marker);
}
