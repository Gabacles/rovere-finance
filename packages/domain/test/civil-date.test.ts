import { describe, expect, it } from 'vitest';
import { occurrenceInMonth, parseCivilDate } from '../src/civil-date.js';

describe('civil dates', () => {
  it.each(['2025-02-29', '1900-02-29', '2026-04-31', '0000-01-01', '2026-00-01', '2026-13-01', '2026-01-00', '2026-1-01', '2026-01-01T00:00:00Z'])('rejects %s', (value) => {
    expect(() => parseCivilDate(value)).toThrow();
  });
  it.each(['0001-01-01', '2000-02-29', '2024-02-29', '9999-12-31'])('preserves valid civil date %s', (value) => {
    expect(parseCivilDate(value)).toBe(value);
  });
  it('clamps a short month without changing the original recurrence anchor', () => {
    expect(occurrenceInMonth(31, 2026, 1)).toBe('2026-01-31');
    expect(occurrenceInMonth(31, 2026, 2)).toBe('2026-02-28');
    expect(occurrenceInMonth(31, 2026, 3)).toBe('2026-03-31');
    expect(occurrenceInMonth(30, 2024, 2)).toBe('2024-02-29');
  });
  it('supports independent salary anchors without moving to weekdays', () => {
    expect(occurrenceInMonth(15, 2026, 2)).toBe('2026-02-15');
    expect(occurrenceInMonth(30, 2026, 2)).toBe('2026-02-28');
  });
  it.each([0, 32, 1.5, NaN])('rejects invalid anchor %s', (day) => {
    expect(() => occurrenceInMonth(day, 2026, 2)).toThrow(RangeError);
  });
});
