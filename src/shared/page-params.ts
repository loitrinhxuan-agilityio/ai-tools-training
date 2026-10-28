/**
 * Both values are supplied by the caller. Neither has a built-in policy here:
 * the default 20 is PROVISIONAL and the maximum 100 is a simulated decision.
 */
export interface PageSizeOptions {
  defaultSize: number;
  maxSize: number;
}

export type PageSizeResult =
  | { ok: true; pageSize: number; capped: boolean }
  | { ok: false; reason: 'non-numeric' | 'non-integer' | 'non-positive' };

const INTEGER_TEXT = /^[+-]?\d+$/;
const DECIMAL_TEXT = /^[+-]?(\d+\.\d*|\.\d+)$/;

function assertValidOptions(options: PageSizeOptions): void {
  for (const [name, value] of [
    ['defaultSize', options.defaultSize],
    ['maxSize', options.maxSize],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }
  if (options.defaultSize > options.maxSize) {
    throw new RangeError('defaultSize must not exceed maxSize');
  }
}

/**
 * Parses the `pageSize` query value. Absent means the default. Values above
 * `maxSize` are capped, not rejected. Zero, negative, non-integer and
 * non-numeric values are rejected with a reason, not an error code.
 *
 * Strings must be plain decimal integers, with an optional sign. A decimal
 * point is reported as non-integer, so `"10.0"` is rejected even though it
 * has an integer value. Cursor parsing is out of scope here.
 */
export function resolvePageSize(
  raw: string | number | undefined,
  options: PageSizeOptions,
): PageSizeResult {
  assertValidOptions(options);

  if (raw === undefined) {
    return { ok: true, pageSize: options.defaultSize, capped: false };
  }

  let value: number;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { ok: false, reason: 'non-numeric' };
    if (!Number.isInteger(raw)) return { ok: false, reason: 'non-integer' };
    value = raw;
  } else if (INTEGER_TEXT.test(raw)) {
    value = Number(raw);
  } else if (DECIMAL_TEXT.test(raw)) {
    return { ok: false, reason: 'non-integer' };
  } else {
    return { ok: false, reason: 'non-numeric' };
  }

  if (value <= 0) return { ok: false, reason: 'non-positive' };
  if (value > options.maxSize) {
    return { ok: true, pageSize: options.maxSize, capped: true };
  }
  return { ok: true, pageSize: value, capped: false };
}
