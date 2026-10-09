import { createServer } from 'vite';
import { createApp } from '../apps/api/dist/app.js';
import { testDatabase } from './test-database.mjs';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ImportWorker } from '../apps/api/dist/imports/worker.js';
const database = await testDatabase();
// Playwright terminates Windows process trees without SIGTERM. Teardown owns cleanup there.
const stopToken = randomUUID();
writeFileSync('.tmp-e2e-database.json', JSON.stringify({ url: database.url, stopToken }));
let app; let web;
async function close() { await web?.close(); await app?.close(); await database.close(); }
try {
  app = await createApp({ databaseUrl: database.url, authSecret: 'test-only-auth-secret-0123456789-abcdefgh', publicOrigin: 'http://127.0.0.1:15173',
    smtpUrl: process.env.SMTP_URL ?? 'smtp://127.0.0.1:11025', mailFrom: 'noreply@rovere.test', production: false });
  await app.listen(0, '127.0.0.1');
  web = await createServer({ root: 'apps/web', server: { host: '127.0.0.1', port: 15173, strictPort: true, proxy: { '/api': await app.getUrl() } },
    plugins: [{ name: 'rovere-e2e-shutdown', configureServer(server) {
      // Register before Vite's fallback; available only in this test server.
      server.middlewares.use('/__e2e__/stop-worker', (req, res) => {
        if (req.method !== 'POST' || req.headers['x-e2e-token'] !== stopToken) { res.statusCode = 404; res.end(); return; }
        void app.get(ImportWorker).stop().then(() => { res.statusCode = 204; res.end(); });
      });
    } }],
  });
  await web.listen();
  process.on('SIGTERM', () => { void close().then(() => process.exit(0)); });
  process.on('SIGINT', () => { void close().then(() => process.exit(0)); });
} catch (error) { await close(); throw error; }
