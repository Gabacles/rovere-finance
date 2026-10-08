import { defineConfig } from '@playwright/test';
export default defineConfig({
  globalTeardown: './scripts/e2e-teardown.mjs',
  testDir: './tests/e2e', workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:15173', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/e2e-server.mjs', url: 'http://127.0.0.1:15173', reuseExistingServer: false, gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 } },
});
