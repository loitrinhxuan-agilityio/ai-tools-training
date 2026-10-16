import { Query, QueryHandler, type IQueryHandler } from '@ocoda/event-sourcing';
import { AccountId } from '../../domain/account-id.js';
import { AccountRepository } from '../../infrastructure/account.repository.js';

export interface AccountStateDto {
  accountId: string;
  ownerName: string;
  currency: string;
  balanceMinor: number;
  /** Number of events replayed to build this state. */
  version: number;
}

export class GetAccountStateQuery extends Query<AccountStateDto> {
  constructor(public readonly accountId: string) {
    super();
  }
}

/**
 * Rebuilds the account by replaying its whole stream. Always consistent, but
 * the cost grows with the stream; Phase 3 adds a projected read model for
 * cheap balance lookups.
 */
@QueryHandler(GetAccountStateQuery)
export class GetAccountStateHandler implements IQueryHandler<GetAccountStateQuery> {
  constructor(private readonly accounts: AccountRepository) {}

  async execute({ accountId }: GetAccountStateQuery): Promise<AccountStateDto> {
    const account = await this.accounts.getById(AccountId.from(accountId));
    return {
      accountId: account.id.value,
      ownerName: account.ownerName,
      currency: account.currency,
      balanceMinor: account.balanceMinor,
      version: account.version,
    };
  }
}
