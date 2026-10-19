import {
  EventStore,
  EventStream,
  Query,
  QueryHandler,
  type IQueryHandler,
} from '@ocoda/event-sourcing';
import {
  AccountNotFoundError,
  DepositNotFoundError,
} from '../../../shared/domain-errors.js';
import { AccountId } from '../../domain/account-id.js';
import { MoneyDepositedEvent } from '../../domain/account.events.js';
import { Account } from '../../domain/account.aggregate.js';

export interface DepositDetailsDto {
  accountId: string;
  operationId: string;
  amountMinor: number;
}

export class GetDepositDetailsQuery extends Query<DepositDetailsDto> {
  constructor(
    public readonly accountId: string,
    public readonly operationId: string,
  ) {
    super();
  }
}

/**
 * Finds one deposit in the account's stream by its idempotency key. The
 * aggregate accepts each operationId at most once, so the first match is the
 * only one. Scans the stream, like the other queries, until Phase 3 adds a
 * projection.
 */
@QueryHandler(GetDepositDetailsQuery)
export class GetDepositDetailsHandler implements IQueryHandler<GetDepositDetailsQuery> {
  constructor(private readonly eventStore: EventStore) {}

  async execute({
    accountId,
    operationId,
  }: GetDepositDetailsQuery): Promise<DepositDetailsDto> {
    const stream = EventStream.for(Account, AccountId.from(accountId));
    let streamHasEvents = false;

    for await (const batch of this.eventStore.getEvents(stream)) {
      for (const event of batch) {
        streamHasEvents = true;
        if (event instanceof MoneyDepositedEvent && event.operationId === operationId) {
          return { accountId, operationId, amountMinor: event.amountMinor };
        }
      }
    }

    if (!streamHasEvents) throw new AccountNotFoundError(accountId);
    throw new DepositNotFoundError(accountId, operationId);
  }
}
