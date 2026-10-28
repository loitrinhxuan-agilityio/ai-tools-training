import type { EventStore } from '@ocoda/event-sourcing';
import { AccountNotFoundError } from '../../../shared/domain-errors.js';
import {
  resolveDateRange,
  type ResolvedDateRange,
} from '../../../shared/date-range.js';
import { AccountId } from '../../domain/account-id.js';
import {
  GetWithdrawalHistoryHandler,
  GetWithdrawalHistoryQuery,
} from './get-withdrawal-history.query.js';

/*
 * The handler only reads envelopes, so a stub store that yields batches of
 * envelope-shaped objects is enough: no Nest container and no database.
 */
const ACCOUNT_ID = AccountId.generate().value;

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

const opened = (version = 1): StubEnvelope =>
  envelope(version, 'account-opened', '2026-10-01T00:00:00Z', {
    accountId: ACCOUNT_ID,
    ownerName: 'Ada',
    currency: 'EUR',
  });

const deposited = (
  version: number,
  occurredOn: string,
  operationId: string,
  amountMinor: number,
) =>
  envelope(version, 'money-deposited', occurredOn, {
    accountId: ACCOUNT_ID,
    amountMinor,
    operationId,
  });

const withdrawn = (
  version: number,
  occurredOn: string,
  operationId: string,
  amountMinor: number,
) =>
  envelope(version, 'money-withdrawn', occurredOn, {
    accountId: ACCOUNT_ID,
    amountMinor,
    operationId,
  });

/** Yields the envelopes in batches of `batchSize`, as the real store does. */
function storeWith(
  envelopes: StubEnvelope[],
  batchSize = envelopes.length || 1,
): EventStore {
  return {
    async *getEnvelopes() {
      for (let i = 0; i < envelopes.length; i += batchSize) {
        yield envelopes.slice(i, i + batchSize);
      }
    },
  } as unknown as EventStore;
}

/** Unbounded range: start of history to a far-future `to`, as a test value. */
const ALL_TIME: ResolvedDateRange = {
  from: null,
  to: new Date('2100-01-01T00:00:00Z'),
  fromOrigin: 'start-of-history',
  toOrigin: 'explicit',
};

const query = (
  range: ResolvedDateRange,
  pageSize: number,
  beforeVersion?: number,
): GetWithdrawalHistoryQuery =>
  new GetWithdrawalHistoryQuery(ACCOUNT_ID, range, pageSize, beforeVersion);

describe('GetWithdrawalHistoryHandler', () => {
  it('rejects an account with no events as unknown', async () => {
    const handler = new GetWithdrawalHistoryHandler(storeWith([]));

    await expect(handler.execute(query(ALL_TIME, 20))).rejects.toThrow(
      AccountNotFoundError,
    );
  });

  it('returns an empty page, not an error, for an account with no withdrawals', async () => {
    const handler = new GetWithdrawalHistoryHandler(
      storeWith([opened(), deposited(2, '2026-10-02T00:00:00Z', 'dep-1', 500)]),
    );

    await expect(handler.execute(query(ALL_TIME, 20))).resolves.toEqual({
      items: [],
      nextBeforeVersion: null,
    });
  });

  it('lists only withdrawals, newest first, with fields from the envelope and payload', async () => {
    const handler = new GetWithdrawalHistoryHandler(
      storeWith([
        opened(),
        withdrawn(2, '2026-10-02T09:00:00Z', 'wd-1', 100),
        deposited(3, '2026-10-03T09:00:00Z', 'dep-1', 500),
        withdrawn(4, '2026-10-04T09:00:00Z', 'wd-2', 250),
      ]),
    );

    const page = await handler.execute(query(ALL_TIME, 20));

    expect(page).toEqual({
      items: [
        {
          version: 4,
          operationId: 'wd-2',
          amountMinor: 250,
          occurredOn: new Date('2026-10-04T09:00:00Z'),
        },
        {
          version: 2,
          operationId: 'wd-1',
          amountMinor: 100,
          occurredOn: new Date('2026-10-02T09:00:00Z'),
        },
      ],
      nextBeforeVersion: null,
    });
  });

  it('never returns a deposit, even when its operationId matches a withdrawal', async () => {
    const handler = new GetWithdrawalHistoryHandler(
      storeWith([
        opened(),
        deposited(2, '2026-10-02T00:00:00Z', 'shared', 500),
        withdrawn(3, '2026-10-03T00:00:00Z', 'wd-1', 100),
      ]),
    );

    const page = await handler.execute(query(ALL_TIME, 20));

    expect(page.items.map((item) => item.operationId)).toEqual(['wd-1']);
  });

  it('includes withdrawals at exactly the inclusive bounds and excludes those outside', async () => {
    const handler = new GetWithdrawalHistoryHandler(
      storeWith([
        withdrawn(1, '2026-10-19T23:59:59.999Z', 'before', 1),
        withdrawn(2, '2026-10-20T00:00:00.000Z', 'at-from', 2),
        withdrawn(3, '2026-10-25T12:00:00.000Z', 'middle', 3),
        withdrawn(4, '2026-10-26T00:00:00.000Z', 'at-to', 4),
        withdrawn(5, '2026-10-26T00:00:00.001Z', 'after', 5),
      ]),
    );
    const range: ResolvedDateRange = {
      from: new Date('2026-10-20T00:00:00.000Z'),
      to: new Date('2026-10-26T00:00:00.000Z'),
      fromOrigin: 'explicit',
      toOrigin: 'explicit',
    };

    const page = await handler.execute(query(range, 20));

    expect(page.items.map((item) => item.operationId)).toEqual([
      'at-to',
      'middle',
      'at-from',
    ]);
  });

  it('treats a null from as the start of history', async () => {
    const handler = new GetWithdrawalHistoryHandler(
      storeWith([
        withdrawn(1, '2001-01-01T00:00:00Z', 'very-old', 1),
        withdrawn(2, '2026-10-02T00:00:00Z', 'recent', 2),
      ]),
    );

    const page = await handler.execute(query(ALL_TIME, 20));

    expect(page.items.map((item) => item.operationId)).toEqual([
      'recent',
      'very-old',
    ]);
  });

  it('pages newest first with an internal beforeVersion position, until no older withdrawal remains', async () => {
    const handler = new GetWithdrawalHistoryHandler(
      storeWith([
        withdrawn(2, '2026-10-02T00:00:00Z', 'w2', 1),
        withdrawn(3, '2026-10-03T00:00:00Z', 'w3', 1),
        withdrawn(4, '2026-10-04T00:00:00Z', 'w4', 1),
        withdrawn(5, '2026-10-05T00:00:00Z', 'w5', 1),
        withdrawn(6, '2026-10-06T00:00:00Z', 'w6', 1),
      ]),
    );

    const first = await handler.execute(query(ALL_TIME, 2));
    expect(first.items.map((item) => item.operationId)).toEqual(['w6', 'w5']);
    expect(first.nextBeforeVersion).toBe(5);

    const second = await handler.execute(
      query(ALL_TIME, 2, first.nextBeforeVersion ?? undefined),
    );
    expect(second.items.map((item) => item.operationId)).toEqual(['w4', 'w3']);
    expect(second.nextBeforeVersion).toBe(3);

    const third = await handler.execute(
      query(ALL_TIME, 2, second.nextBeforeVersion ?? undefined),
    );
    expect(third).toEqual({
      items: [expect.objectContaining({ operationId: 'w2' })],
      nextBeforeVersion: null,
    });
  });

  it('reports no older page when the page holds every withdrawal', async () => {
    const handler = new GetWithdrawalHistoryHandler(
      storeWith([
        withdrawn(2, '2026-10-02T00:00:00Z', 'w2', 1),
        withdrawn(3, '2026-10-03T00:00:00Z', 'w3', 1),
      ]),
    );

    const page = await handler.execute(query(ALL_TIME, 2));

    expect(page.items).toHaveLength(2);
    expect(page.nextBeforeVersion).toBeNull();
  });

  it('gives the same result however the store splits the events into batches', async () => {
    const events = [
      opened(),
      withdrawn(2, '2026-10-02T00:00:00Z', 'w2', 1),
      deposited(3, '2026-10-03T00:00:00Z', 'd3', 1),
      withdrawn(4, '2026-10-04T00:00:00Z', 'w4', 1),
      withdrawn(5, '2026-10-05T00:00:00Z', 'w5', 1),
    ];
    const oneBatch = await new GetWithdrawalHistoryHandler(
      storeWith(events),
    ).execute(query(ALL_TIME, 20));
    const tinyBatches = await new GetWithdrawalHistoryHandler(
      storeWith(events, 1),
    ).execute(query(ALL_TIME, 20));

    expect(tinyBatches).toEqual(oneBatch);
  });

  it('rejects a page size that is not a positive safe integer', async () => {
    const handler = new GetWithdrawalHistoryHandler(storeWith([opened()]));

    await expect(handler.execute(query(ALL_TIME, 0))).rejects.toThrow(
      RangeError,
    );
  });

  it('accepts the resolved range from resolveDateRange without changing its meaning', async () => {
    const now = new Date('2026-10-28T12:00:00.000Z');
    const resolved = resolveDateRange(
      { from: '2026-10-20', to: '2026-10-26' },
      { now, clockToleranceMs: 1_000, defaultLookbackDays: 90 },
    );
    if (!resolved.ok) throw new Error('test input should resolve');

    const handler = new GetWithdrawalHistoryHandler(
      storeWith([
        withdrawn(2, '2026-10-19T23:00:00Z', 'before', 1),
        withdrawn(3, '2026-10-26T23:59:59.999Z', 'last-ms', 1),
        withdrawn(4, '2026-10-27T00:00:00Z', 'after', 1),
      ]),
    );

    const page = await handler.execute(query(resolved.range, 20));

    expect(page.items.map((item) => item.operationId)).toEqual(['last-ms']);
  });
});
