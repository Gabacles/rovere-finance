export const MIN_CENTS = -(2n ** 63n);
export const MAX_CENTS = 2n ** 63n - 1n;

declare const centsBrand: unique symbol;
export type Cents = bigint & { readonly [centsBrand]: true };

function checked(value: bigint): Cents {
  if (value < MIN_CENTS || value > MAX_CENTS) {
    throw new RangeError('Amount exceeds the signed 64-bit cents range.');
  }
  return value as Cents;
}

export function parseCents(value: string): Cents {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*|-[1-9]\d*)$/.test(value)) {
    throw new TypeError('Cents must be a canonical decimal integer string.');
  }
  // Reject oversized input before allocating a large bigint.
  if (value.length > 20) throw new RangeError('Amount exceeds the cents range.');
  return checked(BigInt(value));
}

export function addCents(left: Cents, right: Cents): Cents {
  return checked(left + right);
}

/** Aggregation is order independent; bounded inputs may cancel before the final range check. */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0n;
  for (const value of values) total += checked(value);
  return checked(total);
}

export function subtractCents(left: Cents, right: Cents): Cents {
  return checked(left - right);
}

/** Mathematical allocation only. Does not create purchases, charges or invoices. */
export function allocateCents(total: Cents, parts: number): readonly Cents[] {
  // Computational bound, not a credit-card installment policy.
  if (!Number.isSafeInteger(parts) || parts < 1 || parts > 10000) {
    throw new RangeError('Allocation requires between 1 and 10000 integer parts.');
  }
  const divisor = BigInt(parts);
  const quotient = total / divisor;
  const remainder = total % divisor;
  const sign = remainder < 0n ? -1n : 1n;
  const extraCount = remainder < 0n ? -remainder : remainder;
  return Object.freeze(Array.from({ length: parts }, (_, index) =>
    checked(quotient + (BigInt(index) < extraCount ? sign : 0n)),
  ));
}

export interface MoneyDTO {
  readonly currency: 'BRL';
  readonly cents: string;
}

export function toMoneyDTO(cents: Cents): MoneyDTO {
  return { currency: 'BRL', cents: checked(cents).toString() };
}
