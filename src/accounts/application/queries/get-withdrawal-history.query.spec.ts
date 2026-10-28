import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CommandBus,
  EventSourcingModule,
  EventStore,
} from '@ocoda/event-sourcing';
import { AppModule } from '../../../app.module.js';
import {
  AccountNotFoundError,
  InsufficientFundsError,
} from '../../../shared/domain-errors.js';
import {
  resolveDateRange,
  type ResolvedDateRange,
} from '../../../shared/date-range.js';
import { resolvePageSize } from '../../../shared/page-params.js';
import { AccountId } from '../../domain/account-id.js';
import { DepositMoneyCommand } from '../commands/deposit-money.command.js';
import { OpenAccountCommand } from '../commands/open-account.command.js';
import { WithdrawMoneyCommand } from '../commands/withdraw-money.command.js';
import {
  GetWithdrawalHistoryHandler,
  GetWithdrawalHistoryQuery,
} from './get-withdrawal-history.query.js';

/*
 * Stub-store tests: the handler only reads envelopes, so a stub store that
 * yields batches of envelope-shaped objects is enough. The integration block at
 * the end uses the real in-memory store and real commands.
 */
const ACCOUNT_ID = AccountId.generate().value;
const UNKNOWN_ACCOUNT = '00000000-0000-4000-8000-000000000000';

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
      previousAfterVersion: null,
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
      previousAfterVersion: null,
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
    expect(first.previousAfterVersion).toBeNull();

    const second = await handler.execute(
      query(ALL_TIME, 2, first.nextBeforeVersion ?? undefined),
    );
    expect(second.items.map((item) => item.operationId)).toEqual(['w4', 'w3']);
    expect(second.nextBeforeVersion).toBe(3);
    expect(second.previousAfterVersion).toBe(4);

    const third = await handler.execute(
      query(ALL_TIME, 2, second.nextBeforeVersion ?? undefined),
    );
    expect(third).toEqual({
      items: [expect.objectContaining({ operationId: 'w2' })],
      nextBeforeVersion: null,
      previousAfterVersion: 2,
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

describe('GetWithdrawalHistoryHandler with resolved inputs (composition)', () => {
  // Test values only: the 90-day lookback is PROVISIONAL and the 20/100 page
  // sizes are the simulated values, supplied here by the test, not by the code.
  const NOW = new Date('2026-10-28T12:00:00.000Z');
  const RESOLVE_OPTIONS = {
    now: NOW,
    clockToleranceMs: 1_000,
    defaultLookbackDays: 90,
  };

  it('applies the 90-day default when no dates are given (TC-WH01-009)', async () => {
    const resolved = resolveDateRange({}, RESOLVE_OPTIONS);
    if (!resolved.ok) throw new Error('test input should resolve');
    const handler = new GetWithdrawalHistoryHandler(
      storeWith([
        withdrawn(2, '2026-07-29T00:00:00Z', 'day-91', 1),
        withdrawn(3, '2026-07-31T00:00:00Z', 'day-89', 1),
      ]),
    );

    const page = await handler.execute(query(resolved.range, 20));

    expect(page.items.map((item) => item.operationId)).toEqual(['day-89']);
  });

  it('defaults the page size to 20 when none is given (TC-WH01-011)', async () => {
    const resolved = resolveDateRange({}, RESOLVE_OPTIONS);
    const size = resolvePageSize(undefined, { defaultSize: 20, maxSize: 100 });
    if (!resolved.ok || !size.ok) throw new Error('test input should resolve');
    const events = [opened()];
    for (let v = 2; v <= 26; v++) {
      events.push(
        withdrawn(
          v,
          `2026-10-${String(v - 1).padStart(2, '0')}T00:00:00Z`,
          `w${v}`,
          1,
        ),
      );
    }
    const handler = new GetWithdrawalHistoryHandler(storeWith(events));

    const page = await handler.execute(query(resolved.range, size.pageSize));

    expect(page.items).toHaveLength(20);
    expect(page.nextBeforeVersion).not.toBeNull();
  });

  it('exposes only the internal item keys (TC-WH01-018, -019, -020)', async () => {
    const handler = new GetWithdrawalHistoryHandler(
      storeWith([withdrawn(2, '2026-10-02T00:00:00Z', 'w2', 1)]),
    );

    const page = await handler.execute(query(ALL_TIME, 20));

    expect(Object.keys(page.items[0]).sort()).toEqual([
      'amountMinor',
      'occurredOn',
      'operationId',
      'version',
    ]);
  });
});

describe('GetWithdrawalHistoryHandler paging in both directions', () => {
  const fiveWithdrawals = () =>
    storeWith([
      withdrawn(2, '2026-10-02T00:00:00Z', 'w2', 1),
      withdrawn(3, '2026-10-03T00:00:00Z', 'w3', 1),
      withdrawn(4, '2026-10-04T00:00:00Z', 'w4', 1),
      withdrawn(5, '2026-10-05T00:00:00Z', 'w5', 1),
      withdrawn(6, '2026-10-06T00:00:00Z', 'w6', 1),
    ]);

  const newerThan = (afterVersion: number, pageSize: number) =>
    new GetWithdrawalHistoryQuery(
      ACCOUNT_ID,
      ALL_TIME,
      pageSize,
      undefined,
      afterVersion,
    );

  it('returns the nearest newer withdrawals, newest first, when given afterVersion', async () => {
    const handler = new GetWithdrawalHistoryHandler(fiveWithdrawals());

    const page = await handler.execute(newerThan(3, 2));

    expect(page.items.map((item) => item.operationId)).toEqual(['w5', 'w4']);
    expect(page.previousAfterVersion).toBe(5);
    expect(page.nextBeforeVersion).toBe(4);
  });

  it('walks back to the first page with previousAfterVersion without gaps or repeats', async () => {
    const handler = new GetWithdrawalHistoryHandler(fiveWithdrawals());

    const oldest = await handler.execute(query(ALL_TIME, 2, 3));
    expect(oldest.items.map((item) => item.operationId)).toEqual(['w2']);
    expect(oldest.previousAfterVersion).toBe(2);

    const middle = await handler.execute(
      newerThan(oldest.previousAfterVersion ?? 0, 2),
    );
    expect(middle.items.map((item) => item.operationId)).toEqual(['w4', 'w3']);
    expect(middle.previousAfterVersion).toBe(4);

    const newest = await handler.execute(
      newerThan(middle.previousAfterVersion ?? 0, 2),
    );
    expect(newest.items.map((item) => item.operationId)).toEqual(['w6', 'w5']);
    expect(newest.previousAfterVersion).toBeNull();
    expect(newest.nextBeforeVersion).toBe(5);
  });

  it('reports no newer page on the newest withdrawal', async () => {
    const handler = new GetWithdrawalHistoryHandler(fiveWithdrawals());

    const newest = await handler.execute(query(ALL_TIME, 2));

    expect(newest.previousAfterVersion).toBeNull();
  });

  it('treats null cursors as absent, so they return the same first page as no cursor', async () => {
    const handler = new GetWithdrawalHistoryHandler(fiveWithdrawals());
    const expected = await handler.execute(query(ALL_TIME, 2));

    const nullBefore = new GetWithdrawalHistoryQuery(
      ACCOUNT_ID,
      ALL_TIME,
      2,
      null,
    );
    const nullAfter = new GetWithdrawalHistoryQuery(
      ACCOUNT_ID,
      ALL_TIME,
      2,
      null,
      null,
    );

    await expect(handler.execute(nullBefore)).resolves.toEqual(expected);
    await expect(handler.execute(nullAfter)).resolves.toEqual(expected);
  });

  it('rejects passing both beforeVersion and afterVersion', async () => {
    const handler = new GetWithdrawalHistoryHandler(fiveWithdrawals());
    const both = new GetWithdrawalHistoryQuery(ACCOUNT_ID, ALL_TIME, 2, 5, 3);

    await expect(handler.execute(both)).rejects.toThrow(RangeError);
  });
});

describe('GetWithdrawalHistoryHandler with the in-memory event store and real commands', () => {
  let app: INestApplication;
  let commands: CommandBus;
  let history: GetWithdrawalHistoryHandler;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(EventSourcingModule.forRoot({}))],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    commands = app.get(CommandBus);
    history = new GetWithdrawalHistoryHandler(app.get(EventStore));
  });

  afterEach(async () => {
    await app.close();
  });

  const openAccount = (): Promise<string> =>
    commands.execute(new OpenAccountCommand('Ada', 'EUR'));
  const deposit = (
    accountId: string,
    amountMinor: number,
    operationId: string,
  ) =>
    commands.execute(
      new DepositMoneyCommand(accountId, amountMinor, operationId),
    );
  const withdraw = (
    accountId: string,
    amountMinor: number,
    operationId: string,
  ) =>
    commands.execute(
      new WithdrawMoneyCommand(accountId, amountMinor, operationId),
    );
  const listPage = (
    accountId: string,
    pageSize: number,
    beforeVersion?: number,
  ) =>
    history.execute(
      new GetWithdrawalHistoryQuery(
        accountId,
        ALL_TIME,
        pageSize,
        beforeVersion,
      ),
    );

  it('does not list a withdrawal rejected for insufficient funds (TC-WH01-003)', async () => {
    const accountId = await openAccount();
    await deposit(accountId, 100, 'dep-1');

    await expect(withdraw(accountId, 500, 'wd-fail')).rejects.toThrow(
      InsufficientFundsError,
    );

    const page = await listPage(accountId, 20);
    expect(page.items).toEqual([]);
  });

  it('lists a retried operationId once (TC-WH01-004)', async () => {
    const accountId = await openAccount();
    await deposit(accountId, 1000, 'dep-1');
    await withdraw(accountId, 100, 'wd-1');
    await withdraw(accountId, 100, 'wd-1');

    const page = await listPage(accountId, 20);
    expect(page.items.map((item) => item.operationId)).toEqual(['wd-1']);
  });

  it('lists withdrawals newest first (TC-WH01-002)', async () => {
    const accountId = await openAccount();
    await deposit(accountId, 1000, 'dep-1');
    await withdraw(accountId, 10, 'w-a');
    await withdraw(accountId, 20, 'w-b');
    await withdraw(accountId, 30, 'w-c');

    const page = await listPage(accountId, 20);
    expect(page.items.map((item) => item.operationId)).toEqual([
      'w-c',
      'w-b',
      'w-a',
    ]);
  });

  it('takes occurredOn from the stored event, as a Date (TC-WH01-001 timestamp)', async () => {
    const accountId = await openAccount();
    await deposit(accountId, 1000, 'dep-1');
    const before = Date.now();
    await withdraw(accountId, 10, 'w-a');

    const page = await listPage(accountId, 20);
    const at = page.items[0].occurredOn.getTime();
    expect(page.items[0].occurredOn).toBeInstanceOf(Date);
    expect(at).toBeGreaterThanOrEqual(before - 1_000);
    expect(at).toBeLessThanOrEqual(Date.now() + 1_000);
  });

  it('scopes the list to the requested account (TC-WH01-016)', async () => {
    const accountA = await openAccount();
    const accountB = await openAccount();
    await deposit(accountA, 1000, 'dep-a');
    await deposit(accountB, 1000, 'dep-b');
    await withdraw(accountA, 100, 'a-1');
    await withdraw(accountB, 200, 'b-1');

    const page = await listPage(accountA, 20);
    expect(page.items.map((item) => item.operationId)).toEqual(['a-1']);
  });

  it('pages 25 withdrawals as 20 then 5 with no duplicates or gaps (TC-WH01-012)', async () => {
    const accountId = await openAccount();
    await deposit(accountId, 2500, 'dep-1');
    for (let i = 1; i <= 25; i++) {
      await withdraw(accountId, 10, `w-${String(i).padStart(2, '0')}`);
    }

    const first = await listPage(accountId, 20);
    expect(first.items).toHaveLength(20);
    const second = await listPage(
      accountId,
      20,
      first.nextBeforeVersion ?? undefined,
    );
    expect(second.items).toHaveLength(5);
    expect(second.nextBeforeVersion).toBeNull();

    const ids = [...first.items, ...second.items].map(
      (item) => item.operationId,
    );
    expect(new Set(ids).size).toBe(25);
  });

  it('returns AccountNotFoundError for an unknown account (TC-WH01-014)', async () => {
    await expect(listPage(UNKNOWN_ACCOUNT, 20)).rejects.toThrow(
      AccountNotFoundError,
    );
  });

  it('returns an empty list for an account with no withdrawals (TC-WH01-013)', async () => {
    const accountId = await openAccount();
    await deposit(accountId, 500, 'dep-1');

    const page = await listPage(accountId, 20);
    expect(page).toEqual({
      items: [],
      nextBeforeVersion: null,
      previousAfterVersion: null,
    });
  });

  const ids = (page: { items: { operationId: string }[] }) =>
    page.items.map((item) => item.operationId);
  const newerThan = (
    accountId: string,
    pageSize: number,
    afterVersion: number,
  ) =>
    history.execute(
      new GetWithdrawalHistoryQuery(
        accountId,
        ALL_TIME,
        pageSize,
        undefined,
        afterVersion,
      ),
    );

  it('walks forward and back through real-store pages without gaps or repeats', async () => {
    const accountId = await openAccount();
    await deposit(accountId, 1000, 'dep-1');
    for (let i = 1; i <= 5; i++) {
      await withdraw(accountId, 10, `w${i}`);
    }

    const newest = await listPage(accountId, 2);
    expect(ids(newest)).toEqual(['w5', 'w4']);
    const middle = await listPage(
      accountId,
      2,
      newest.nextBeforeVersion ?? undefined,
    );
    expect(ids(middle)).toEqual(['w3', 'w2']);
    const oldest = await listPage(
      accountId,
      2,
      middle.nextBeforeVersion ?? undefined,
    );
    expect(ids(oldest)).toEqual(['w1']);
    expect(oldest.nextBeforeVersion).toBeNull();

    expect(oldest.previousAfterVersion).not.toBeNull();
    const backToMiddle = await newerThan(
      accountId,
      2,
      oldest.previousAfterVersion as number,
    );
    expect(ids(backToMiddle)).toEqual(['w3', 'w2']);

    expect(backToMiddle.previousAfterVersion).not.toBeNull();
    const backToNewest = await newerThan(
      accountId,
      2,
      backToMiddle.previousAfterVersion as number,
    );
    expect(ids(backToNewest)).toEqual(['w5', 'w4']);
    expect(backToNewest.previousAfterVersion).toBeNull();
  });

  it('keeps pages gap-free and duplicate-free when withdrawals are appended between requests', async () => {
    const accountId = await openAccount();
    await deposit(accountId, 1000, 'dep-1');
    for (const id of ['w1', 'w2', 'w3']) {
      await withdraw(accountId, 10, id);
    }

    const first = await listPage(accountId, 2);
    expect(ids(first)).toEqual(['w3', 'w2']);
    const topVersion = first.items[0].version;

    await withdraw(accountId, 10, 'w4');
    await withdraw(accountId, 10, 'w5');

    const older = await listPage(
      accountId,
      2,
      first.nextBeforeVersion ?? undefined,
    );
    expect(ids(older)).toEqual(['w1']);
    const newer = await newerThan(accountId, 2, topVersion);
    expect(ids(newer)).toEqual(['w5', 'w4']);

    expect([...ids(newer), ...ids(first), ...ids(older)]).toEqual([
      'w5',
      'w4',
      'w3',
      'w2',
      'w1',
    ]);
  });
});
