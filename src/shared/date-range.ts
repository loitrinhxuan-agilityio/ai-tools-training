const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;

/**
 * Inputs the caller must supply. None has a default here: the tolerance and
 * the lookback are client decisions that are still OPEN or PROVISIONAL.
 */
export interface DateRangeOptions {
  /** Injected clock, so the result never depends on when the code runs. */
  now: Date;
  /** Allowed clock skew, in milliseconds. The value is OPEN. */
  clockToleranceMs: number;
  /** Lookback used only when both bounds are omitted. 90 is PROVISIONAL. */
  defaultLookbackDays: number;
}

export interface DateRangeInput {
  /** Omitted when undefined. An empty string is malformed, not omitted. */
  from?: string;
  to?: string;
}

export type DateRangeFailureReason =
  'malformed' | 'missing-timezone' | 'future-from' | 'future-to' | 'reversed';

/**
 * A validation failure. It carries a reason, not an API error code or HTTP
 * status: those mappings are a separate, unapproved decision.
 */
export type DateRangeFailure = {
  ok: false;
  reason: DateRangeFailureReason;
  /** Set when one bound caused the failure. Absent for `reversed`. */
  field?: 'from' | 'to';
};

export interface ResolvedDateRange {
  /** Inclusive lower bound, or null for the start of history. */
  from: Date | null;
  /** Inclusive upper bound. */
  to: Date;
  fromOrigin: 'explicit' | 'default-lookback' | 'start-of-history';
  toOrigin: 'explicit' | 'now';
}

export type DateRangeResult =
  { ok: true; range: ResolvedDateRange } | DateRangeFailure;

/** A parsed bound. A date-only value spans its whole UTC day. */
type ParsedBound =
  | { ok: true; start: number; end: number }
  | { ok: false; reason: 'malformed' | 'missing-timezone' };

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;
const DATE_TIME_NO_ZONE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/;

/**
 * Epoch milliseconds for a UTC calendar time, or null when the fields do not
 * name a real time (for example 2026-02-30 or hour 24). Rejects leap seconds.
 */
function utcMillis(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): number | null {
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  // Date.UTC maps years 0-99 to 1900-1999, so set the year explicitly.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  date.setUTCHours(hour, minute, second, millisecond);
  return date.getTime();
}

/** Fraction of a second, truncated to whole milliseconds. */
function millisecondsOf(fraction: string | undefined): number {
  if (fraction === undefined) return 0;
  return Number(fraction.padEnd(3, '0').slice(0, 3));
}

function parseBound(text: string): ParsedBound {
  const dateOnly = DATE_ONLY.exec(text);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    const start = utcMillis(Number(y), Number(mo), Number(d), 0, 0, 0, 0);
    if (start === null) return { ok: false, reason: 'malformed' };
    return { ok: true, start, end: start + MS_PER_DAY - 1 };
  }

  const match = DATE_TIME.exec(text);
  if (match) {
    const [, y, mo, d, h, mi, s, fraction, zone] = match;
    const local = utcMillis(
      Number(y),
      Number(mo),
      Number(d),
      Number(h),
      Number(mi),
      Number(s),
      millisecondsOf(fraction),
    );
    if (local === null) return { ok: false, reason: 'malformed' };

    let offsetMinutes = 0;
    if (zone !== 'Z') {
      const sign = zone.startsWith('-') ? -1 : 1;
      const zh = Number(zone.slice(1, 3));
      const zm = Number(zone.slice(4, 6));
      if (zh > 23 || zm > 59) return { ok: false, reason: 'malformed' };
      offsetMinutes = sign * (zh * 60 + zm);
    }
    const instant = local - offsetMinutes * MS_PER_MINUTE;
    return { ok: true, start: instant, end: instant };
  }

  const noZone = DATE_TIME_NO_ZONE.exec(text);
  if (noZone) {
    const [, y, mo, d, h, mi, s, fraction] = noZone;
    const local = utcMillis(
      Number(y),
      Number(mo),
      Number(d),
      Number(h),
      Number(mi),
      Number(s),
      millisecondsOf(fraction),
    );
    return local === null
      ? { ok: false, reason: 'malformed' }
      : { ok: false, reason: 'missing-timezone' };
  }

  return { ok: false, reason: 'malformed' };
}

function assertValidOptions(options: DateRangeOptions): void {
  if (Number.isNaN(options.now.getTime())) {
    throw new RangeError('now must be a valid Date');
  }
  if (
    !Number.isFinite(options.clockToleranceMs) ||
    options.clockToleranceMs < 0
  ) {
    throw new RangeError(
      'clockToleranceMs must be a finite, non-negative number',
    );
  }
  if (
    !Number.isSafeInteger(options.defaultLookbackDays) ||
    options.defaultLookbackDays <= 0
  ) {
    throw new RangeError('defaultLookbackDays must be a positive safe integer');
  }
}

/**
 * Resolves the optional `from` and `to` of a history request to inclusive
 * UTC instants. Pure: the clock is injected and the input is not modified.
 *
 * Simulated rules (spec section 4.7): UTC; bounds inclusive; `from` alone
 * ends at now; `to` alone starts at the beginning of history; both omitted
 * uses the rolling lookback. A date-only `from` starts at UTC midnight and a
 * date-only `to` ends at the last millisecond of its UTC day. Rejects
 * reversed, malformed, timezone-less, and future bounds.
 *
 * Future bounds are compared to `now + clockToleranceMs`, using the start of
 * a date-only value. Sub-millisecond precision is truncated.
 */
export function resolveDateRange(
  input: DateRangeInput,
  options: DateRangeOptions,
): DateRangeResult {
  assertValidOptions(options);

  const nowMs = options.now.getTime();
  const limitMs = nowMs + options.clockToleranceMs;

  const parsedFrom = input.from === undefined ? null : parseBound(input.from);
  const parsedTo = input.to === undefined ? null : parseBound(input.to);

  if (parsedFrom?.ok === false) {
    return { ok: false, reason: parsedFrom.reason, field: 'from' };
  }
  if (parsedTo?.ok === false) {
    return { ok: false, reason: parsedTo.reason, field: 'to' };
  }
  if (parsedFrom && parsedFrom.start > limitMs) {
    return { ok: false, reason: 'future-from', field: 'from' };
  }
  if (parsedTo && parsedTo.start > limitMs) {
    return { ok: false, reason: 'future-to', field: 'to' };
  }

  let fromMs: number | null;
  let fromOrigin: ResolvedDateRange['fromOrigin'];
  if (parsedFrom) {
    fromMs = parsedFrom.start;
    fromOrigin = 'explicit';
  } else if (parsedTo) {
    fromMs = null;
    fromOrigin = 'start-of-history';
  } else {
    fromMs = nowMs - options.defaultLookbackDays * MS_PER_DAY;
    fromOrigin = 'default-lookback';
  }

  const toMs = parsedTo ? parsedTo.end : nowMs;
  const toOrigin: ResolvedDateRange['toOrigin'] = parsedTo ? 'explicit' : 'now';

  if (fromMs !== null && fromMs > toMs) {
    return { ok: false, reason: 'reversed' };
  }

  return {
    ok: true,
    range: {
      from: fromMs === null ? null : new Date(fromMs),
      to: new Date(toMs),
      fromOrigin,
      toOrigin,
    },
  };
}
