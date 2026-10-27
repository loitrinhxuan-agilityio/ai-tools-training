import { InvalidAmountError, InvalidCurrencyError } from './domain-errors.js';
import {
  addMinor,
  assertCurrencyCode,
  assertPositiveMinorAmount,
  subtractMinor,
} from './money.js';

describe('money', () => {
  it.each([1, 1050, Number.MAX_SAFE_INTEGER])('accepts %s minor units', (amount) => {
    expect(() => assertPositiveMinorAmount(amount)).not.toThrow();
  });

  it.each([0, -1, 10.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects %s minor units',
    (amount) => {
      expect(() => assertPositiveMinorAmount(amount)).toThrow(InvalidAmountError);
    },
  );

  it('adds amounts exactly and refuses unsafe results', () => {
    expect(addMinor(10, 5)).toBe(15);
    expect(() => addMinor(Number.MAX_SAFE_INTEGER, 1)).toThrow(InvalidAmountError);
  });

  it('subtracts amounts exactly, down to zero', () => {
    expect(subtractMinor(15, 5)).toBe(10);
    expect(subtractMinor(500, 500)).toBe(0);
  });

  it('refuses subtractions that would go negative as an invariant failure, not client input', () => {
    expect(() => subtractMinor(500, 501)).toThrow(/invariant/);
    expect(() => subtractMinor(500, 501)).not.toThrow(InvalidAmountError);
  });

  it('validates ISO 4217-shaped currency codes', () => {
    expect(() => assertCurrencyCode('EUR')).not.toThrow();
    expect(() => assertCurrencyCode('eur')).toThrow(InvalidCurrencyError);
    expect(() => assertCurrencyCode('EURO')).toThrow(InvalidCurrencyError);
  });
});
