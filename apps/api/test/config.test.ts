import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';

const valid = { DATABASE_URL: 'postgresql://user:fake@localhost/db', APP_ORIGIN: 'http://127.0.0.1:18080', BETTER_AUTH_SECRET: 'development-only-secret-at-least-32-characters', SMTP_URL: 'smtp://127.0.0.1:11025', MAIL_FROM: 'Rovere <noreply@rovere.test>' };
describe('startup configuration', () => {
  it('fails closed on missing secrets', () => { expect(() => readConfig({})).toThrow(); });
  it('rejects weak secrets', () => { expect(() => readConfig({ ...valid, BETTER_AUTH_SECRET: 'weak' })).toThrow(); });
  it('rejects HTTP or development secret in production', () => {
    expect(() => readConfig({ ...valid, NODE_ENV: 'production' })).toThrow();
    expect(() => readConfig({ ...valid, NODE_ENV: 'production', APP_ORIGIN: 'https://rovere.test' })).toThrow();
  });
  it('requires a pure origin and valid service protocols', () => {
    for (const APP_ORIGIN of ['https://rovere.test/redirect', 'ftp://rovere.test', 'https://user:pass@rovere.test']) expect(() => readConfig({ ...valid, APP_ORIGIN })).toThrow();
    expect(() => readConfig({ ...valid, SMTP_URL: 'https://example.test' })).toThrow();
  });
  it('accepts the isolated local environment', () => { expect(readConfig(valid).publicOrigin).toBe(valid.APP_ORIGIN); });
});
