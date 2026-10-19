import type { EventStore, IEvent } from '@ocoda/event-sourcing';
import {
  AccountNotFoundError,
  DepositNotFoundError,
} from '../../../shared/domain-errors.js';
import { AccountId } from '../../domain/account-id.js';
import { AccountOpenedEvent, MoneyDepositedEvent } from '../../domain/account.events.js';
import { GetDepositDetailsHandler, GetDepositDetailsQuery } from './get-deposit-details.query.js';

/*
 * The handler only reads the stream, so a stub store that yields batches of
 * events (like Ocoda's `getEvents`) is enough: no Nest container, no database.
 */
const ACCOUNT_ID = AccountId.generate().value;

function handlerWithHistory(...history: IEvent[]): GetDepositDetailsHandler {
  const eventStore = {
    async *getEvents() {
      if (history.length > 0) yield history;
    },
  } as unknown as EventStore;
  return new GetDepositDetailsHandler(eventStore);
}

const opened = () => new AccountOpenedEvent(ACCOUNT_ID, 'Ada', 'EUR');
const deposited = (amountMinor: number, operationId: string) =>
  new MoneyDepositedEvent(ACCOUNT_ID, amountMinor, operationId);

describe('GetDepositDetailsHandler', () => {
  it('returns the account id, operation id and amount of the matching deposit', async () => {
    const handler = handlerWithHistory(opened(), deposited(500, 'op-1'), deposited(1050, 'op-2'));

    await expect(handler.execute(new GetDepositDetailsQuery(ACCOUNT_ID, 'op-2'))).resolves.toEqual({
      accountId: ACCOUNT_ID,
      operationId: 'op-2',
      amountMinor: 1050,
    });
  });

  it('rejects an account with no events as unknown', async () => {
    const handler = handlerWithHistory();

    await expect(
      handler.execute(new GetDepositDetailsQuery(ACCOUNT_ID, 'op-1')),
    ).rejects.toThrow(AccountNotFoundError);
  });

  it('rejects an operationId the account never received', async () => {
    const handler = handlerWithHistory(opened(), deposited(500, 'op-1'));

    await expect(
      handler.execute(new GetDepositDetailsQuery(ACCOUNT_ID, 'op-missing')),
    ).rejects.toThrow(DepositNotFoundError);
  });

  it('rejects a lookup on an account that has no deposits yet', async () => {
    const handler = handlerWithHistory(opened());

    await expect(
      handler.execute(new GetDepositDetailsQuery(ACCOUNT_ID, 'op-1')),
    ).rejects.toThrow(DepositNotFoundError);
  });
});
