import type { EventStore } from '@ocoda/event-sourcing';
import {
  ListSupportWithdrawalsHandler,
  ListSupportWithdrawalsQuery,
  type SupportWithdrawalLookupOptions,
} from './list-support-withdrawals.query.js';
import { AccountId } from '../../domain/account-id.js';

/*
 * Stub store, as in get-withdrawal-history.query.spec.ts: the handler only reads
 * envelopes, so no Nest container and no database are needed.
 */
const ACCOUNT_ID = AccountId.generate().value;
const NOW = new Date('2026-10-28T12:00:00.000Z');

const OPTIONS: SupportWithdrawalLookupOptions = {
  clock: () => NOW,
  clockToleranceMs: 0,
  defaultLookbackDays: 90,
  defaultPageSize: 20,
  maxPageSize: 100,
};

interface StubEnvelope {
  event: string;
  payload: Record<string, unknown>;
  metadata: { version: number; occurredOn: Date };
}

const envelope = (
  version: number,
  event: string,
  occurredOn: string,
  payload: Record<string, unknown>,
): StubEnvelope => ({
  event,
  payload,
  metadata: { version, occurredOn: new Date(occurredOn) },
});

const opened = (): StubEnvelope =>
  envelope(1, 'account-opened', '2026-01-01T00:00:00.000Z', {
    accountId: ACCOUNT_ID,
    ownerName: 'Ada',
    currency: 'EUR',
  });

const withdrawn = (
  version: number,
  occurredOn: string,
  operationId: string,
  amountMinor = 100,
): StubEnvelope =>
  envelope(version, 'money-withdrawn', occurredOn, {
    accountId: ACCOUNT_ID,
    amountMinor,
    operationId,
  });

const deposited = (
  version: number,
  occurredOn: string,
  operationId: string,
): StubEnvelope =>
  envelope(version, 'money-deposited', occurredOn, {
    accountId: ACCOUNT_ID,
    amountMinor: 500,
    operationId,
  });

/** Yields the envelopes in batches, as the real store does. */
function storeWith(envelopes: StubEnvelope[]): EventStore {
  return {
    async *getEnvelopes() {
      yield envelopes;
    },
  } as unknown as EventStore;
}

/** Fails if read, so a test can prove validation happened before any store read. */
const storeMustNotBeRead = {
  getEnvelopes() {
    throw new Error('store must not be read for an invalid request');
  },
} as unknown as EventStore;

const lookup = (
  envelopes: StubEnvelope[],
  from?: string,
  to?: string,
  pageSize?: string | number,
  beforeVersion?: number,
  options: SupportWithdrawalLookupOptions = OPTIONS,
) =>
  new ListSupportWithdrawalsHandler(storeWith(envelopes), options).execute(
    new ListSupportWithdrawalsQuery(
      ACCOUNT_ID,
      from,
      to,
      pageSize,
      beforeVersion,
    ),
  );

const operationIds = (items: { operationId: string }[]) =>
  items.map((item) => item.operationId);

describe('ListSupportWithdrawalsHandler', () => {
  describe('date range', () => {
    // TC-WH03-001
    it('returns only withdrawals inside the range', async () => {
      const page = await lookup(
        [
          opened(),
          withdrawn(2, '2026-10-18T10:00:00.000Z', 'op-10'),
          withdrawn(3, '2026-10-23T10:00:00.000Z', 'op-5'),
          withdrawn(4, '2026-10-27T10:00:00.000Z', 'op-1'),
        ],
        '2026-10-22',
        '2026-10-24',
      );

      expect(operationIds(page.items)).toEqual(['op-5']);
    });

    // TC-WH03-002
    it('includes a withdrawal at exactly the instant when from equals to', async () => {
      const page = await lookup(
        [
          opened(),
          withdrawn(2, '2026-10-20T09:30:00.000Z', 'op-exact'),
          withdrawn(3, '2026-10-20T09:30:00.001Z', 'op-later'),
        ],
        '2026-10-20T09:30:00Z',
        '2026-10-20T09:30:00Z',
      );

      expect(operationIds(page.items)).toEqual(['op-exact']);
    });

    it('covers the whole UTC day when from and to are the same date', async () => {
      const page = await lookup(
        [
          opened(),
          withdrawn(2, '2026-10-20T00:00:00.000Z', 'op-start'),
          withdrawn(3, '2026-10-20T23:59:59.999Z', 'op-end'),
          withdrawn(4, '2026-10-21T00:00:00.000Z', 'op-next-day'),
        ],
        '2026-10-20',
        '2026-10-20',
      );

      expect(operationIds(page.items)).toEqual(['op-end', 'op-start']);
    });

    // Acceptance criterion: a date-only from starts at UTC midnight.
    it('starts a date-only from at UTC midnight, excluding the previous day', async () => {
      const page = await lookup(
        [
          opened(),
          withdrawn(2, '2026-10-19T23:59:59.999Z', 'op-previous-day'),
          withdrawn(3, '2026-10-20T00:00:00.000Z', 'op-midnight'),
        ],
        '2026-10-20',
        '2026-10-21',
      );

      expect(operationIds(page.items)).toEqual(['op-midnight']);
    });

    it('applies both ends of an explicit timestamp range inclusively', async () => {
      const page = await lookup(
        [
          opened(),
          withdrawn(2, '2026-10-20T09:29:59.999Z', 'before'),
          withdrawn(3, '2026-10-20T09:30:00.000Z', 'at-from'),
          withdrawn(4, '2026-10-21T09:30:00.000Z', 'at-to'),
          withdrawn(5, '2026-10-21T09:30:00.001Z', 'after'),
        ],
        '2026-10-20T09:30:00.000Z',
        '2026-10-21T09:30:00.000Z',
      );

      expect(operationIds(page.items)).toEqual(['at-to', 'at-from']);
    });

    it('converts a timestamp with an offset to UTC before comparing', async () => {
      const page = await lookup(
        [opened(), withdrawn(2, '2026-10-20T09:30:00.000Z', 'op-utc')],
        '2026-10-20T11:30:00+02:00',
        '2026-10-20T11:30:00+02:00',
      );

      expect(operationIds(page.items)).toEqual(['op-utc']);
    });

    // Clock regression: version order and occurredOn order disagree. Filtering
    // is on occurredOn, ordering is on version, and paging must not lose or
    // duplicate an item.
    it('filters on occurredOn and pages by version when the clock regressed', async () => {
      const envelopes = [
        opened(),
        withdrawn(3, '2026-10-27T10:00:00.000Z', 'op-v3'),
        withdrawn(5, '2026-10-01T10:00:00.000Z', 'op-v5-regressed'),
        withdrawn(7, '2026-10-26T10:00:00.000Z', 'op-v7'),
      ];

      const first = await lookup(envelopes, '2026-10-25', '2026-10-28', 1);
      expect(operationIds(first.items)).toEqual(['op-v7']);
      expect(first.nextBeforeVersion).toBe(7);

      const second = await lookup(
        envelopes,
        '2026-10-25',
        '2026-10-28',
        1,
        first.nextBeforeVersion ?? undefined,
      );
      expect(operationIds(second.items)).toEqual(['op-v3']);
      expect(second.nextBeforeVersion).toBeNull();
    });

    // TC-WH03-003
    it('rejects from after to without reading the store', async () => {
      await expect(
        new ListSupportWithdrawalsHandler(storeMustNotBeRead, OPTIONS).execute(
          new ListSupportWithdrawalsQuery(
            ACCOUNT_ID,
            '2026-10-20',
            '2026-10-10',
          ),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_DATE_RANGE' });
    });

    // TC-WH03-004
    it('rejects a malformed date and names the field', async () => {
      await expect(
        new ListSupportWithdrawalsHandler(storeMustNotBeRead, OPTIONS).execute(
          new ListSupportWithdrawalsQuery(ACCOUNT_ID, 'not-a-date'),
        ),
      ).rejects.toMatchObject({
        code: 'INVALID_DATE',
        message: expect.stringContaining('from'),
      });
    });

    it('rejects a timestamp without a timezone', async () => {
      await expect(
        new ListSupportWithdrawalsHandler(storeMustNotBeRead, OPTIONS).execute(
          new ListSupportWithdrawalsQuery(
            ACCOUNT_ID,
            undefined,
            '2026-10-20T09:30:00',
          ),
        ),
      ).rejects.toMatchObject({
        code: 'INVALID_DATE',
        message: expect.stringContaining('timezone'),
      });
    });

    it('rejects a future from', async () => {
      await expect(
        new ListSupportWithdrawalsHandler(storeMustNotBeRead, OPTIONS).execute(
          new ListSupportWithdrawalsQuery(
            ACCOUNT_ID,
            '2026-10-28T12:00:00.001Z',
          ),
        ),
      ).rejects.toMatchObject({ code: 'FUTURE_DATE' });
    });

    it('rejects a future to', async () => {
      await expect(
        new ListSupportWithdrawalsHandler(storeMustNotBeRead, OPTIONS).execute(
          new ListSupportWithdrawalsQuery(ACCOUNT_ID, undefined, '2026-10-29'),
        ),
      ).rejects.toMatchObject({ code: 'FUTURE_DATE' });
    });

    // The handler must pass the injected tolerance through. 60 s is a test
    // value only; the real tolerance is OPEN.
    it('passes the clock tolerance to the future-date check', async () => {
      const tolerant = { ...OPTIONS, clockToleranceMs: 60_000 };

      await expect(
        lookup(
          [opened()],
          '2026-10-28T12:00:30.000Z',
          '2026-10-28T12:00:45.000Z',
          undefined,
          undefined,
          tolerant,
        ),
      ).resolves.toMatchObject({ items: [] });
      await expect(
        lookup(
          [opened()],
          '2026-10-28T12:02:00.000Z',
          undefined,
          undefined,
          undefined,
          tolerant,
        ),
      ).rejects.toMatchObject({ code: 'FUTURE_DATE' });
    });

    it('accepts a date-only to for today, which covers the whole day', async () => {
      const page = await lookup(
        [opened(), withdrawn(2, '2026-10-28T11:00:00.000Z', 'op-today')],
        undefined,
        '2026-10-28',
      );

      expect(operationIds(page.items)).toEqual(['op-today']);
    });

    // TC-WH03-006 (PROVISIONAL: 90-day default)
    it('applies the 90-day lookback only when neither bound is given', async () => {
      const page = await lookup([
        opened(),
        withdrawn(2, '2026-07-31T12:00:00.000Z', 'op-day-89'),
        withdrawn(3, '2026-07-29T12:00:00.000Z', 'op-day-91'),
      ]);

      expect(operationIds(page.items)).toEqual(['op-day-89']);
    });

    it('does not apply the lookback when only to is given', async () => {
      const page = await lookup(
        [opened(), withdrawn(2, '2026-01-15T12:00:00.000Z', 'op-old')],
        undefined,
        '2026-10-28',
      );

      expect(operationIds(page.items)).toEqual(['op-old']);
    });

    // PROVISIONAL edge: this test records the current inclusive behaviour; it
    // does not claim the client has decided it.
    it('includes an item at exactly now minus the lookback (PROVISIONAL)', async () => {
      const page = await lookup([
        opened(),
        withdrawn(2, '2026-07-30T12:00:00.000Z', 'op-at-edge'),
        withdrawn(3, '2026-07-30T11:59:59.999Z', 'op-just-outside'),
      ]);

      expect(operationIds(page.items)).toEqual(['op-at-edge']);
    });
  });

  describe('page size', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        withdrawn(index + 2, '2026-10-20T10:00:00.000Z', `op-${index}`),
      );

    it('returns 20 items when no page size is given', async () => {
      const page = await lookup([opened(), ...many(25)]);

      expect(page.items).toHaveLength(20);
    });

    it('caps a page size above the maximum at 100', async () => {
      const envelopes = [opened(), ...many(105)];

      expect(
        (await lookup(envelopes, undefined, undefined, '500')).items,
      ).toHaveLength(100);
      expect(
        (await lookup(envelopes, undefined, undefined, 150)).items,
      ).toHaveLength(100);
    });

    it.each([
      ['zero', '0'],
      ['negative', '-1'],
      ['a decimal', '1.5'],
      ['non-numeric', 'abc'],
    ])(
      'rejects a page size that is %s without reading the store',
      async (_, raw) => {
        await expect(
          new ListSupportWithdrawalsHandler(
            storeMustNotBeRead,
            OPTIONS,
          ).execute(
            new ListSupportWithdrawalsQuery(
              ACCOUNT_ID,
              undefined,
              undefined,
              raw,
            ),
          ),
        ).rejects.toMatchObject({ code: 'INVALID_PAGE_SIZE' });
      },
    );
  });

  describe('contents', () => {
    it('returns an empty page when no withdrawal matches', async () => {
      const page = await lookup(
        [opened(), withdrawn(2, '2026-10-01T10:00:00.000Z', 'op-old')],
        '2026-10-20',
        '2026-10-21',
      );

      expect(page).toEqual({
        items: [],
        nextBeforeVersion: null,
        previousAfterVersion: null,
      });
    });

    it('rejects an account with no events', async () => {
      await expect(lookup([])).rejects.toMatchObject({
        code: 'ACCOUNT_NOT_FOUND',
      });
    });

    it('never returns deposits that share the stream', async () => {
      const page = await lookup([
        opened(),
        deposited(2, '2026-10-20T10:00:00.000Z', 'dep-1'),
        withdrawn(3, '2026-10-20T11:00:00.000Z', 'wd-1'),
      ]);

      expect(operationIds(page.items)).toEqual(['wd-1']);
    });

    // A failed attempt leaves no event, so it cannot match. Only events that
    // exist in the stream are considered.
    it('returns nothing for a stream holding only non-withdrawal events', async () => {
      const page = await lookup([
        opened(),
        deposited(2, '2026-10-20T10:00:00.000Z', 'dep-1'),
      ]);

      expect(page.items).toEqual([]);
    });
  });
});
