import assert from 'node:assert/strict';
import { preview } from 'vite';

const server = await preview({
  root: 'apps/web',
  configFile: false,
  preview: { host: '127.0.0.1', port: 0, open: false },
});
try {
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /<title>Rovere Finance<\/title>/);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1]);
  assert(assets.length >= 2, 'Expected built JavaScript and stylesheet.');
  for (const asset of assets) {
    const result = await fetch(`${base}${asset}`);
    assert.equal(result.status, 200, asset);
    assert((await result.text()).length > 0, asset);
  }
  console.log(`Web HTTP smoke OK: HTML and ${assets.length} built assets served. This is not a browser rendering/E2E test.`);
} finally {
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
