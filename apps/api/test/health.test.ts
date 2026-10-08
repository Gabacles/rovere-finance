import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../dist/app.js';

describe('HTTP liveness', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let url: string;
  beforeAll(async () => {
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });
  it('serves the documented route without claiming database readiness', async () => {
    const response = await fetch(`${url}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: 'rovere-api', check: 'liveness' });
  });
  it('does not expose a financial API before implementation', async () => {
    const response = await fetch(`${url}/api/imports`);
    expect(response.status).toBe(404);
  });
});
