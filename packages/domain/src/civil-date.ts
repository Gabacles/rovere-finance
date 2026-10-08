declare const civilDateBrand: unique symbol;
export type CivilDate = string & { readonly [civilDateBrand]: true };

function validateYearMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1 || year > 9999 ||
      !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Year/month outside the supported Gregorian calendar.');
  }
}

function monthLength(year: number, month: number): number {
  validateYearMonth(year, month);
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseCivilDate(value: string): CivilDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('Civil date must use YYYY-MM-DD.');
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (day < 1 || day > monthLength(year, month)) throw new RangeError('Invalid calendar day.');
  return value as CivilDate;
}

/** Pass the original anchor each time; do not use last month's adjusted day. */
export function occurrenceInMonth(anchorDay: number, year: number, month: number): CivilDate {
  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) {
    throw new RangeError('Anchor day must be an integer between 1 and 31.');
  }
  const day = Math.min(anchorDay, monthLength(year, month));
  return parseCivilDate(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}
