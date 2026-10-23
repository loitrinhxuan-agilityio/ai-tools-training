import {
  Command,
  CommandHandler,
  type ICommandHandler,
} from '@ocoda/event-sourcing';
import { AccountId } from '../../domain/account-id.js';
import type {
  Account,
  WithdrawResult,
} from '../../domain/account.aggregate.js';
import { ConcurrencyConflictError } from '../../../shared/domain-errors.js';
import { AccountRepository } from '../../infrastructure/account.repository.js';

export interface WithdrawMoneyResult {
  accountId: string;
  operationId: string;
  status: WithdrawResult;
  balanceMinor: number;
}

export class WithdrawMoneyCommand extends Command<WithdrawMoneyResult> {
  constructor(
    public readonly accountId: string,
    public readonly amountMinor: number,
    public readonly operationId: string,
  ) {
    super();
  }
}

@CommandHandler(WithdrawMoneyCommand)
export class WithdrawMoneyHandler implements ICommandHandler<WithdrawMoneyCommand> {
  constructor(private readonly accounts: AccountRepository) {}

  async execute(command: WithdrawMoneyCommand): Promise<WithdrawMoneyResult> {
    const accountId = AccountId.from(command.accountId);
    const account = await this.accounts.getById(accountId);
    try {
      return await this.decideAndSave(account, command);
    } catch (error) {
      if (!(error instanceof ConcurrencyConflictError)) throw error;

      // A concurrent writer may have stored this operationId. If so, replay
      // once so a retry gets 'duplicate' (or OPERATION_ID_REUSED), not a conflict.
      const reloaded = await this.accounts.getById(accountId);
      if (!reloaded.hasProcessedOperation(command.operationId)) throw error;
      return this.decideAndSave(reloaded, command);
    }
  }

  private async decideAndSave(
    account: Account,
    command: WithdrawMoneyCommand,
  ): Promise<WithdrawMoneyResult> {
    const status = account.withdraw(command.amountMinor, command.operationId);
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
