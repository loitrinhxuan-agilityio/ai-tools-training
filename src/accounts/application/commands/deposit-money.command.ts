import {
  Command,
  CommandHandler,
  type ICommandHandler,
} from '@ocoda/event-sourcing';
import { AccountId } from '../../domain/account-id.js';
import type { DepositResult } from '../../domain/account.aggregate.js';
import { AccountRepository } from '../../infrastructure/account.repository.js';

export interface DepositMoneyResult {
  accountId: string;
  operationId: string;
  status: DepositResult;
  balanceMinor: number;
}

export class DepositMoneyCommand extends Command<DepositMoneyResult> {
  constructor(
    public readonly accountId: string,
    public readonly amountMinor: number,
    public readonly operationId: string,
  ) {
    super();
  }
}

@CommandHandler(DepositMoneyCommand)
export class DepositMoneyHandler implements ICommandHandler<DepositMoneyCommand> {
  constructor(private readonly accounts: AccountRepository) {}

  async execute(command: DepositMoneyCommand): Promise<DepositMoneyResult> {
    const account = await this.accounts.getById(
      AccountId.from(command.accountId),
    );
    const status = account.deposit(command.amountMinor, command.operationId);
    await this.accounts.save(account);

    // Returned straight from the aggregate: read models may lag behind.
    return {
      accountId: account.id.value,
      operationId: command.operationId,
      status,
      balanceMinor: account.balanceMinor,
    };
  }
}
