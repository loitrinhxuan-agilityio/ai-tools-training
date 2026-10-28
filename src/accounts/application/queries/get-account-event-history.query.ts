import {
  EventStore,
  EventStream,
  Query,
  QueryHandler,
  type IQueryHandler,
} from '@ocoda/event-sourcing';
import { AccountNotFoundError } from '../../../shared/domain-errors.js';
import { AccountId } from '../../domain/account-id.js';
import { Account } from '../../domain/account.aggregate.js';

export interface AccountEventDto {
  version: number;
  event: string;
  eventId: string;
  occurredOn: string;
  /** Decimal string: a bigint does not fit in JSON. */
  globalPosition: string | null;
  payload: Record<string, unknown>;
}

export class GetAccountEventHistoryQuery extends Query<AccountEventDto[]> {
  constructor(public readonly accountId: string) {
    super();
  }
}

/**
 * Reads the account's stream straight from the event store: the source of
 * truth, in the order the events were appended.
 */
@QueryHandler(GetAccountEventHistoryQuery)
export class GetAccountEventHistoryHandler
  implements IQueryHandler<GetAccountEventHistoryQuery>
{
  constructor(private readonly eventStore: EventStore) {}

  async execute({
    accountId,
  }: GetAccountEventHistoryQuery): Promise<AccountEventDto[]> {
    const stream = EventStream.for(Account, AccountId.from(accountId));
    const history: AccountEventDto[] = [];

    for await (const batch of this.eventStore.getEnvelopes(stream)) {
      for (const envelope of batch) {
        history.push({
          version: envelope.metadata.version,
          event: envelope.event,
          eventId: envelope.metadata.eventId.value,
          occurredOn: envelope.metadata.occurredOn.toISOString(),
          globalPosition: envelope.metadata.globalPosition?.toString() ?? null,
          payload: { ...envelope.payload },
        });
      }
    }

    if (history.length === 0) throw new AccountNotFoundError(accountId);
    return history;
  }
}
