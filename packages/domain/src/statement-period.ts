import { parseCivilDate } from './civil-date.js';

declare const statementPeriodBrand: unique symbol;
export type StatementPeriod = string & { readonly [statementPeriodBrand]: true };

/** A confirmed invoice month, independent of download ranges and cash dates. */
export function parseStatementPeriod(value: string): StatementPeriod {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) {
    throw new TypeError('Statement period must use YYYY-MM.');
  }
  parseCivilDate(`${value}-01`);
  return value as StatementPeriod;
}
