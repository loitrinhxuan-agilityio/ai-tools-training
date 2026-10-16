import {
  Command,
  CommandHandler,
  type ICommandHandler,
} from '@ocoda/event-sourcing';
import { AccountId } from '../../domain/account-id.js';
import { Account } from '../../domain/account.aggregate.js';
import { AccountRepository } from '../../infrastructure/account.repository.js';

export class OpenAccountCommand extends Command<string> {
  constructor(
    public readonly ownerName: string,
    public readonly currency: string,
  ) {
    super();
  }
}

@CommandHandler(OpenAccountCommand)
export class OpenAccountHandler implements ICommandHandler<OpenAccountCommand> {
  constructor(private readonly accounts: AccountRepository) {}

  /** Returns the new account id. */
  async execute({ ownerName, currency }: OpenAccountCommand): Promise<string> {
    const account = Account.open(AccountId.generate(), ownerName, currency);
    await this.accounts.save(account);
    return account.id.value;
  }
}
