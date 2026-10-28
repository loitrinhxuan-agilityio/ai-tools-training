import { InvalidAmountError, InvalidCurrencyError } from './domain-errors.js';

/**
 * Money is always an integer number of minor units (e.g. cents), never a float.
 * `number` stays exact up to Number.MAX_SAFE_INTEGER and serialises to JSON,
 * which `bigint` does not.
 */
export function assertPositiveMinorAmount(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new InvalidAmountError(
      `Amount must be a positive integer number of minor units, got ${amountMinor}`,
    );
  }
}

/** Adds two minor-unit amounts, refusing results that would lose precision. */
export function addMinor(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) {
    throw new InvalidAmountError('Resulting balance exceeds the supported range');
  }
  return sum;
}

/**
 * Subtracts `b` from `a` during replay. A negative result means stored history
 * is already inconsistent. That is a server-side invariant failure, not bad
 * client input, so it is deliberately not a DomainError (it maps to 500).
 */
export function subtractMinor(a: number, b: number): number {
  const difference = a - b;
  if (!Number.isSafeInteger(difference) || difference < 0) {
    throw new Error(`Balance invariant violated: cannot subtract ${b} from ${a}`);
  }
  return difference;
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

export function assertCurrencyCode(currency: string): void {
  if (!CURRENCY_CODE.test(currency)) {
    throw new InvalidCurrencyError(
      `Currency must be a 3-letter ISO 4217 code, got "${currency}"`,
    );
  }
}
