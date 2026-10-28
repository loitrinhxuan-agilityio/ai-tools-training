import { resolveDateRange, type DateRangeOptions } from './date-range.js';

/*
 * Test inputs only. The clock tolerance is OPEN and the 90-day lookback is
 * PROVISIONAL, so neither value is a policy. Tests never probe the exact
 * tolerance boundary or the day -90 edge.
 */
const NOW = new Date('2026-10-28T12:00:00.000Z');
const TOLERANCE_MS = 1_000;
const LOOKBACK_DAYS = 90;

const options = (
  overrides: Partial<DateRangeOptions> = {},
): DateRangeOptions => ({
  now: NOW,
  clockToleranceMs: TOLERANCE_MS,
  defaultLookbackDays: LOOKBACK_DAYS,
  ...overrides,
});

describe('resolveDateRange', () => {
  describe('options', () => {
    it.each([
      ['an invalid now', { now: new Date('not a date') }],
      ['a negative tolerance', { clockToleranceMs: -1 }],
      ['a NaN tolerance', { clockToleranceMs: Number.NaN }],
      ['a zero lookback', { defaultLookbackDays: 0 }],
      ['a fractional lookback', { defaultLookbackDays: 1.5 }],
    ])('throws a RangeError for %s', (_, overrides) => {
      expect(() => resolveDateRange({}, options(overrides))).toThrow(
        RangeError,
      );
    });

    it('requires the clock tolerance and the lookback to be supplied', () => {
      const withoutTolerance = { now: NOW, defaultLookbackDays: 90 };
      const withoutLookback = { now: NOW, clockToleranceMs: 0 };

      // @ts-expect-error clockToleranceMs has no default and must be supplied
      expect(() => resolveDateRange({}, withoutTolerance)).toThrow();
      // @ts-expect-error defaultLookbackDays has no default and must be supplied
      expect(() => resolveDateRange({}, withoutLookback)).toThrow();
    });
  });

  describe('defaults', () => {
    it('uses the rolling lookback ending now when both bounds are omitted', () => {
      const result = resolveDateRange({}, options());

      expect(result).toEqual({
        ok: true,
        range: {
          from: new Date(NOW.getTime() - LOOKBACK_DAYS * 86_400_000),
          to: NOW,
          fromOrigin: 'default-lookback',
          toOrigin: 'now',
        },
      });
    });

    it('applies the lookback that the caller injects', () => {
      const result = resolveDateRange({}, options({ defaultLookbackDays: 7 }));

      expect(result.ok && result.range.from).toEqual(
        new Date('2026-10-21T12:00:00.000Z'),
      );
    });
  });

  describe('one-sided bounds', () => {
    it('ends at now when only from is given', () => {
      const result = resolveDateRange(
        { from: '2026-10-20T00:00:00Z' },
        options(),
      );

      expect(result).toEqual({
        ok: true,
        range: {
          from: new Date('2026-10-20T00:00:00.000Z'),
          to: NOW,
          fromOrigin: 'explicit',
          toOrigin: 'now',
        },
      });
    });

    it('starts at the beginning of history when only to is given', () => {
      const result = resolveDateRange(
        { to: '2026-10-20T00:00:00Z' },
        options(),
      );

      expect(result).toEqual({
        ok: true,
        range: {
          from: null,
          to: new Date('2026-10-20T00:00:00.000Z'),
          fromOrigin: 'start-of-history',
          toOrigin: 'explicit',
        },
      });
    });
  });

  describe('date-only and full timestamps', () => {
    it('starts a date-only from at UTC midnight', () => {
      const result = resolveDateRange({ from: '2026-10-20' }, options());

      expect(result.ok && result.range.from).toEqual(
        new Date('2026-10-20T00:00:00.000Z'),
      );
    });

    it('ends a date-only to at the last millisecond of its UTC day', () => {
      const result = resolveDateRange({ to: '2026-10-20' }, options());

      expect(result.ok && result.range.to).toEqual(
        new Date('2026-10-20T23:59:59.999Z'),
      );
    });

    it('accepts a date-only to for today, which covers the whole day', () => {
      const result = resolveDateRange({ to: '2026-10-28' }, options());

      expect(result.ok).toBe(true);
      expect(result.ok && result.range.to).toEqual(
        new Date('2026-10-28T23:59:59.999Z'),
      );
    });

    it('converts a timestamp with an offset to UTC', () => {
      const result = resolveDateRange(
        { from: '2026-10-27T14:00:00+02:00' },
        options(),
      );

      expect(result.ok && result.range.from).toEqual(
        new Date('2026-10-27T12:00:00.000Z'),
      );
    });

    it('accepts a Z timestamp and an explicit +00:00 offset as the same instant', () => {
      const z = resolveDateRange({ from: '2026-10-27T12:00:00Z' }, options());
      const offset = resolveDateRange(
        { from: '2026-10-27T12:00:00+00:00' },
        options(),
      );

      expect(z.ok && offset.ok && z.range.from).toEqual(
        offset.ok && offset.range.from,
      );
    });

    it('reads fractional seconds and truncates below one millisecond', () => {
      const half = resolveDateRange(
        { from: '2026-10-27T12:00:00.5Z' },
        options(),
      );
      const micro = resolveDateRange(
        { from: '2026-10-27T12:00:00.123456Z' },
        options(),
      );

      expect(half.ok && half.range.from?.getTime()).toBe(
        Date.parse('2026-10-27T12:00:00.500Z'),
      );
      expect(micro.ok && micro.range.from?.getTime()).toBe(
        Date.parse('2026-10-27T12:00:00.123Z'),
      );
    });

    it('accepts a leap day in a leap year and rejects it otherwise', () => {
      expect(
        resolveDateRange(
          { from: '2028-02-29' },
          options({ now: new Date('2030-01-01T00:00:00Z') }),
        ).ok,
      ).toBe(true);
      expect(resolveDateRange({ from: '2026-02-29' }, options())).toMatchObject(
        {
          ok: false,
          reason: 'malformed',
          field: 'from',
        },
      );
    });
  });

  describe('explicit bounds', () => {
    it('includes both ends of an explicit timestamp range', () => {
      const result = resolveDateRange(
        { from: '2026-10-20T10:00:00Z', to: '2026-10-20T10:00:00Z' },
        options(),
      );

      expect(result.ok && result.range.from).toEqual(
        new Date('2026-10-20T10:00:00.000Z'),
      );
      expect(result.ok && result.range.to).toEqual(
        new Date('2026-10-20T10:00:00.000Z'),
      );
    });

    it('treats from equal to to as valid for a date-only day', () => {
      const result = resolveDateRange(
        { from: '2026-10-20', to: '2026-10-20' },
        options(),
      );

      expect(result.ok).toBe(true);
      expect(result.ok && result.range.from).toEqual(
        new Date('2026-10-20T00:00:00.000Z'),
      );
      expect(result.ok && result.range.to).toEqual(
        new Date('2026-10-20T23:59:59.999Z'),
      );
    });

    it('does not shift explicit bounds', () => {
      const result = resolveDateRange(
        { from: '2026-10-20T10:00:00Z', to: '2026-10-21T10:00:00Z' },
        options(),
      );

      expect(result).toEqual({
        ok: true,
        range: {
          from: new Date('2026-10-20T10:00:00.000Z'),
          to: new Date('2026-10-21T10:00:00.000Z'),
          fromOrigin: 'explicit',
          toOrigin: 'explicit',
        },
      });
    });
  });

  describe('reversed ranges', () => {
    it('rejects a timestamp from after to', () => {
      expect(
        resolveDateRange(
          { from: '2026-10-27T10:00:00Z', to: '2026-10-26T10:00:00Z' },
          options(),
        ),
      ).toEqual({ ok: false, reason: 'reversed' });
    });

    it('rejects a date-only from after to', () => {
      expect(
        resolveDateRange({ from: '2026-10-20', to: '2026-10-19' }, options()),
      ).toEqual({
        ok: false,
        reason: 'reversed',
      });
    });

    it('rejects a date-only from after a timestamp to on an earlier day', () => {
      expect(
        resolveDateRange(
          { from: '2026-10-20', to: '2026-10-19T23:00:00Z' },
          options(),
        ),
      ).toEqual({ ok: false, reason: 'reversed' });
    });
  });

  describe('malformed input', () => {
    it.each([
      '',
      'yesterday',
      '2026/10/28',
      '2026-13-01',
      '2026-02-30',
      '2026-10-28 12:00:00Z',
      '2026-10-28T24:00:00Z',
      '2026-10-28T12:00Z',
      '2026-10-28T12:00:60Z',
    ])('rejects %j as malformed', (value) => {
      expect(resolveDateRange({ from: value }, options())).toEqual({
        ok: false,
        reason: 'malformed',
        field: 'from',
      });
    });

    it('reports the field that is malformed', () => {
      expect(resolveDateRange({ to: 'not-a-date' }, options())).toEqual({
        ok: false,
        reason: 'malformed',
        field: 'to',
      });
    });
  });

  describe('timezone-less timestamps', () => {
    it('rejects a timestamp without a timezone', () => {
      expect(
        resolveDateRange({ from: '2026-10-27T12:00:00' }, options()),
      ).toEqual({
        ok: false,
        reason: 'missing-timezone',
        field: 'from',
      });
    });

    it('rejects a timezone-less timestamp with fractional seconds', () => {
      expect(
        resolveDateRange({ to: '2026-10-27T12:00:00.5' }, options()),
      ).toEqual({
        ok: false,
        reason: 'missing-timezone',
        field: 'to',
      });
    });

    it('reports an invalid calendar date as malformed even without a timezone', () => {
      expect(
        resolveDateRange({ from: '2026-02-30T12:00:00' }, options()),
      ).toMatchObject({
        reason: 'malformed',
      });
    });
  });

  describe('future bounds', () => {
    it('rejects a date-only from in the future', () => {
      expect(resolveDateRange({ from: '2026-10-29' }, options())).toEqual({
        ok: false,
        reason: 'future-from',
        field: 'from',
      });
    });

    it('rejects a timestamp from clearly beyond the tolerance', () => {
      expect(
        resolveDateRange({ from: '2026-10-28T12:10:00Z' }, options()),
      ).toEqual({
        ok: false,
        reason: 'future-from',
        field: 'from',
      });
    });

    it('rejects a to in the future', () => {
      expect(
        resolveDateRange(
          { from: '2026-10-20', to: '2026-10-29T00:00:00Z' },
          options(),
        ),
      ).toEqual({ ok: false, reason: 'future-to', field: 'to' });
    });

    it('rejects a date-only to after today', () => {
      expect(resolveDateRange({ to: '2026-10-29' }, options())).toEqual({
        ok: false,
        reason: 'future-to',
        field: 'to',
      });
    });

    it('accepts a to a little ahead of now, within the injected tolerance', () => {
      const result = resolveDateRange(
        {
          from: '2026-10-20T00:00:00Z',
          to: new Date(NOW.getTime() + 500).toISOString(),
        },
        options(),
      );

      expect(result.ok).toBe(true);
    });
  });

  it('does not modify the injected clock or the input', () => {
    const now = new Date(NOW.getTime());
    const input = { from: '2026-10-20' };
    const result = resolveDateRange(input, options({ now }));

    expect(now.getTime()).toBe(NOW.getTime());
    expect(input).toEqual({ from: '2026-10-20' });
    expect(result.ok && result.range.to).not.toBe(now);
  });
});
