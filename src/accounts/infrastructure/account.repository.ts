import { Injectable } from '@nestjs/common';
import {
  EventSourcingErrorCode,
  EventStore,
  EventStream,
  isEventSourcingError,
} from '@ocoda/event-sourcing';
import {
  AccountNotFoundError,
  ConcurrencyConflictError,
} from '../../shared/domain-errors.js';
import { AccountId } from '../domain/account-id.js';
import { Account } from '../domain/account.aggregate.js';

/**
 * Loads an Account by replaying its stream and saves it by appending only its
 * new events. `expectedVersion` gives optimistic concurrency: if anyone else
 * appended since we loaded, the append fails and nothing is written.
 */
@Injectable()
export class AccountRepository {
  constructor(private readonly eventStore: EventStore) {}

  async getById(accountId: AccountId): Promise<Account> {
    const stream = EventStream.for(Account, accountId);
    const account = new Account();
    await account.loadFromHistory(this.eventStore.getEvents(stream));

    // An empty stream means the account was never opened.
    if (account.version === 0) {
      throw new AccountNotFoundError(accountId.value);
    }
    return account;
  }

  async save(account: Account): Promise<void> {
    const events = account.getUncommittedEvents();
    if (events.length === 0) return;

    const stream = EventStream.for(Account, account.id);
    try {
      await this.eventStore.appendEvents(stream, events, {
        expectedVersion: account.committedVersion,
      });
    } catch (error) {
      if (
        isEventSourcingError(error, EventSourcingErrorCode.EventStoreVersionConflict)
      ) {
        throw new ConcurrencyConflictError(stream.streamId);
      }
      throw error;
    }
    account.markCommitted(events);
  }
}
