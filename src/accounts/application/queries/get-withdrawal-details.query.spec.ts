import type { EventEnvelope, EventStore } from '@ocoda/event-sourcing';
import {
  AccountNotFoundError,
  WithdrawalNotFoundError,
} from '../../../shared/domain-errors.js';
import { AccountId } from '../../domain/account-id.js';
import {
  AccountOpenedEvent,
  MoneyDepositedEvent,
  MoneyWithdrawnEvent,
} from '../../domain/account.events.js';
import {
  GetWithdrawalDetailsHandler,
  GetWithdrawalDetailsQuery,
} from './get-withdrawal-details.query.js';

/*
 * The handler only reads envelopes, so a stub store that yields batches of
 * envelopes (like Ocoda's `getEnvelopes`) is enough: no Nest container, no database.
 */
const ACCOUNT_ID = AccountId.generate().value;
const OCCURRED_ON = new Date('2026-10-01T09:30:00.000Z');

/** `name` is the stored event name from `@Event(...)`, not the class name. */
function envelope(name: string, event: object, version: number): EventEnvelope {
  return {
    event: name,
    payload: { ...event },
    metadata: { version, occurredOn: OCCURRED_ON },
  } as unknown as EventEnvelope;
}

/** Builds a store that yields the given envelopes in batches of `batchSize`. */
function handlerWithHistory(
  history: EventEnvelope[],
  batchSize = history.length,
): GetWithdrawalDetailsHandler {
  const eventStore = {
    async *getEnvelopes() {
      for (let i = 0; i < history.length; i += batchSize) {
        yield history.slice(i, i + batchSize);
      }
    },
  } as unknown as EventStore;
  return new GetWithdrawalDetailsHandler(eventStore);
}

const opened = () =>
  envelope(
    'account-opened',
    new AccountOpenedEvent(ACCOUNT_ID, 'Ada', 'EUR'),
    1,
  );
const deposited = (amountMinor: number, operationId: string, version: number) =>
  envelope(
    'money-deposited',
    new MoneyDepositedEvent(ACCOUNT_ID, amountMinor, operationId),
    version,
  );
const withdrawn = (amountMinor: number, operationId: string, version: number) =>
  envelope(
    'money-withdrawn',
    new MoneyWithdrawnEvent(ACCOUNT_ID, amountMinor, operationId),
    version,
  );

describe('GetWithdrawalDetailsHandler', () => {
  it('returns the operation id, amount, timestamp and status of the matching withdrawal only', async () => {
    const handler = handlerWithHistory([
      opened(),
      deposited(500, 'op-1', 2),
      withdrawn(200, 'op-2', 3),
    ]);

    const result = await handler.execute(
      new GetWithdrawalDetailsQuery(ACCOUNT_ID, 'op-2'),
    );

    expect(result).toEqual({
      operationId: 'op-2',
      amountMinor: 200,
      occurredOn: OCCURRED_ON,
      status: 'succeeded',
    });
    expect(Object.keys(result).sort()).toEqual([
      'amountMinor',
      'occurredOn',
      'operationId',
      'status',
    ]);
  });

  it('rejects an account with no events as unknown', async () => {
    const handler = handlerWithHistory([]);

    await expect(
      handler.execute(new GetWithdrawalDetailsQuery(ACCOUNT_ID, 'op-1')),
    ).rejects.toThrow(AccountNotFoundError);
  });

  it('rejects an operationId the account never withdrew with', async () => {
    const handler = handlerWithHistory([opened(), withdrawn(200, 'op-1', 2)]);

    await expect(
      handler.execute(new GetWithdrawalDetailsQuery(ACCOUNT_ID, 'op-missing')),
    ).rejects.toThrow(WithdrawalNotFoundError);
  });

  it('does not return a deposit that shares the operationId', async () => {
    const handler = handlerWithHistory([opened(), deposited(500, 'op-1', 2)]);

    await expect(
      handler.execute(new GetWithdrawalDetailsQuery(ACCOUNT_ID, 'op-1')),
    ).rejects.toThrow(WithdrawalNotFoundError);
  });

  it('finds a withdrawal that sits in a later batch', async () => {
    const handler = handlerWithHistory(
      [
        opened(),
        deposited(500, 'op-1', 2),
        withdrawn(200, 'op-2', 3),
        withdrawn(50, 'op-3', 4),
      ],
      1,
    );

    await expect(
      handler.execute(new GetWithdrawalDetailsQuery(ACCOUNT_ID, 'op-3')),
    ).resolves.toMatchObject({ operationId: 'op-3', amountMinor: 50 });
  });

  it('rejects an account with no withdrawals yet', async () => {
    const handler = handlerWithHistory([opened()]);

    await expect(
      handler.execute(new GetWithdrawalDetailsQuery(ACCOUNT_ID, 'op-1')),
    ).rejects.toThrow(WithdrawalNotFoundError);
  });
});
