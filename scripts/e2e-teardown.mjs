import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { closeTestDatabase } from './test-database.mjs';
export default async function teardown() {
  const marker = '.tmp-e2e-database.json';
  if (!existsSync(marker)) return;
  const { url } = JSON.parse(readFileSync(marker, 'utf8'));
  await closeTestDatabase(url);
  unlinkSync(marker);
}
