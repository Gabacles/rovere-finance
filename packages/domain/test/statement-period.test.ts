import { describe, expect, it } from 'vitest';
import { parseStatementPeriod } from '../src/statement-period.js';

describe('confirmed statement period', () => {
  it('accepts the supported Gregorian year/month boundaries', () => {
    for (const value of ['0001-01', '2026-02', '2026-10', '9999-12']) expect(parseStatementPeriod(value)).toBe(value);
  });
  it('rejects incomplete, ambiguous or out-of-range periods', () => {
    for (const value of ['0000-01', '2026-00', '2026-13', '10000-01', '2026-1', '10/2026', '2026-10-01', '', ' 2026-10']) {
      expect(() => parseStatementPeriod(value)).toThrow();
    }
  });
});
