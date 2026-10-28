import { resolvePageSize, type PageSizeOptions } from './page-params.js';

/*
 * Test inputs only. The default 20 is PROVISIONAL and the maximum 100 is a
 * simulated decision. Neither is hard-coded in the parser under test.
 */
const DEFAULT_SIZE = 20;
const MAX_SIZE = 100;

const options = (
  overrides: Partial<PageSizeOptions> = {},
): PageSizeOptions => ({
  defaultSize: DEFAULT_SIZE,
  maxSize: MAX_SIZE,
  ...overrides,
});

describe('resolvePageSize', () => {
  describe('options', () => {
    it.each([
      ['a zero default', { defaultSize: 0 }],
      ['a negative max', { maxSize: -5 }],
      ['a fractional default', { defaultSize: 2.5 }],
      ['an unsafe max', { maxSize: Number.MAX_SAFE_INTEGER + 1 }],
      ['a default above the max', { defaultSize: 200, maxSize: 100 }],
    ])('throws a RangeError for %s', (_, overrides) => {
      expect(() => resolvePageSize(undefined, options(overrides))).toThrow(
        RangeError,
      );
    });

    it('requires both the default and the maximum to be supplied', () => {
      // @ts-expect-error defaultSize has no default and must be supplied
      expect(() => resolvePageSize(undefined, { maxSize: 100 })).toThrow(
        RangeError,
      );
      // @ts-expect-error maxSize has no default and must be supplied
      expect(() => resolvePageSize(undefined, { defaultSize: 20 })).toThrow(
        RangeError,
      );
    });
  });

  it('uses the configured default when no page size is given', () => {
    expect(resolvePageSize(undefined, options())).toEqual({
      ok: true,
      pageSize: DEFAULT_SIZE,
      capped: false,
    });
  });

  it('uses whatever default the caller configures', () => {
    expect(resolvePageSize(undefined, options({ defaultSize: 5 }))).toEqual({
      ok: true,
      pageSize: 5,
      capped: false,
    });
  });

  describe('valid values', () => {
    it.each([
      ['a numeric string', '20', 20],
      ['a single digit', '1', 1],
      ['a number', 7, 7],
      ['a signed string', '+5', 5],
    ])('accepts %s', (_, raw, expected) => {
      expect(resolvePageSize(raw, options())).toEqual({
        ok: true,
        pageSize: expected,
        capped: false,
      });
    });
  });

  describe('capping', () => {
    it('caps a string above the maximum without rejecting it', () => {
      expect(resolvePageSize('101', options())).toEqual({
        ok: true,
        pageSize: MAX_SIZE,
        capped: true,
      });
    });

    it('caps a number above the maximum', () => {
      expect(resolvePageSize(500, options())).toEqual({
        ok: true,
        pageSize: MAX_SIZE,
        capped: true,
      });
    });

    it('does not mark a value equal to the maximum as capped', () => {
      expect(resolvePageSize('100', options())).toEqual({
        ok: true,
        pageSize: MAX_SIZE,
        capped: false,
      });
    });
  });

  describe('rejections', () => {
    it.each([
      ['zero as a number', 0],
      ['a negative number', -1],
      ['zero as a string', '0'],
      ['a negative string', '-3'],
      ['negative zero as a string', '-0'],
    ])('rejects %s as non-positive', (_, raw) => {
      expect(resolvePageSize(raw, options())).toEqual({
        ok: false,
        reason: 'non-positive',
      });
    });

    it.each([
      ['a fractional number', 10.5],
      ['a fractional string', '10.5'],
      ['a decimal with a zero fraction', '10.0'],
      ['a trailing decimal point', '10.'],
    ])('rejects %s as non-integer', (_, raw) => {
      expect(resolvePageSize(raw, options())).toEqual({
        ok: false,
        reason: 'non-integer',
      });
    });

    it.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['letters', 'abc'],
      ['an empty string', ''],
      ['leading whitespace', ' 20'],
      ['trailing whitespace', '20 '],
      ['exponent notation', '1e2'],
      ['hexadecimal', '0x10'],
    ])('rejects %s as non-numeric', (_, raw) => {
      expect(resolvePageSize(raw, options())).toEqual({
        ok: false,
        reason: 'non-numeric',
      });
    });
  });
});
