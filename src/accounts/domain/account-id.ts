import { UUID } from '@ocoda/event-sourcing';

/**
 * Accounts are created with lowercase UUIDs. Lowercasing here keeps `AAAA…`
 * and `aaaa…` on the same stream, so an uppercase request still finds the account.
 */
export class AccountId extends UUID {
  static from(id: string): AccountId {
    return super.from(typeof id === 'string' ? id.toLowerCase() : id);
  }
}
