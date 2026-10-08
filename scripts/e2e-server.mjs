import { createServer } from 'vite';
import { createApp } from '../apps/api/dist/app.js';
import { testDatabase } from './test-database.mjs';
import { writeFileSync } from 'node:fs';
const database = await testDatabase();
// Playwright terminates Windows process trees without SIGTERM. Teardown owns cleanup there.
writeFileSync('.tmp-e2e-database.json', JSON.stringify({ url: database.url }));
let app; let web;
async function close() { await web?.close(); await app?.close(); await database.close(); }
try {
  app = await createApp({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: 'http://127.0.0.1:15173',
    smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false });
  await app.listen(0, '127.0.0.1');
  web = await createServer({ root: 'apps/web', server: { host: '127.0.0.1', port: 15173, strictPort: true, proxy: { '/api': await app.getUrl() } } });
  await web.listen();
  process.on('SIGTERM', () => { void close().then(() => process.exit(0)); });
  process.on('SIGINT', () => { void close().then(() => process.exit(0)); });
} catch (error) { await close(); throw error; }
