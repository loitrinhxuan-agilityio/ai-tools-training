import { Aggregate, AggregateRoot, EventHandler } from '@ocoda/event-sourcing';
import {
  InsufficientFundsError,
  InvalidOwnerNameError,
  OperationIdReusedError,
} from '../../shared/domain-errors.js';
import {
  addMinor,
  assertCurrencyCode,
  assertPositiveMinorAmount,
  subtractMinor,
} from '../../shared/money.js';
import { AccountId } from './account-id.js';
import {
  AccountOpenedEvent,
  MoneyDepositedEvent,
  MoneyWithdrawnEvent,
} from './account.events.js';

export type DepositResult = 'deposited' | 'duplicate';
export type WithdrawResult = 'withdrawn' | 'duplicate';

type OperationType = 'deposit' | 'withdrawal';

/** What an operationId was first used for. A retry must match both fields. */
interface ProcessedOperation {
  type: OperationType;
  amountMinor: number;
}

/**
 * The consistency boundary for one bank account (stream `account-<id>`).
 *
 * Decision methods (`open`, `deposit`, `withdraw`) validate business rules and
 * then call `applyEvent`. Only `@EventHandler` methods change state, so
 * replaying the stored events rebuilds exactly the same state. No I/O happens
 * here.
 */
@Aggregate({ streamName: 'account' })
export class Account extends AggregateRoot {
  id: AccountId;
  ownerName: string;
  currency: string;
  balanceMinor = 0;

  /** operationId -> { type, amountMinor }, so a retried request is recognised. */
  private readonly processedOperations = new Map<string, ProcessedOperation>();

  static open(id: AccountId, ownerName: string, currency: string): Account {
    const trimmedName = ownerName.trim();
    if (trimmedName.length === 0 || trimmedName.length > 100) {
      throw new InvalidOwnerNameError(
        'Owner name must be between 1 and 100 characters',
      );
    }
    assertCurrencyCode(currency);

    const account = new Account();
    account.applyEvent(
      new AccountOpenedEvent(id.value, trimmedName, currency),
    );
    return account;
  }

  deposit(amountMinor: number, operationId: string): DepositResult {
    assertPositiveMinorAmount(amountMinor);
    if (this.isAlreadyProcessed(operationId, 'deposit', amountMinor)) {
      return 'duplicate';
    }

    // Check overflow before emitting, so we never store an unreplayable event.
    addMinor(this.balanceMinor, amountMinor);
    this.applyEvent(
      new MoneyDepositedEvent(this.id.value, amountMinor, operationId),
    );
    return 'deposited';
  }

  /**
   * Order matters: the idempotency check runs before the funds check. A retry
   * of a withdrawal that already succeeded must return 'duplicate', not fail,
   * because the balance has already dropped.
   */
  withdraw(amountMinor: number, operationId: string): WithdrawResult {
    assertPositiveMinorAmount(amountMinor);
    if (this.isAlreadyProcessed(operationId, 'withdrawal', amountMinor)) {
      return 'duplicate';
    }

    if (amountMinor > this.balanceMinor) {
      throw new InsufficientFundsError(this.id.value, amountMinor, this.balanceMinor);
    }
    this.applyEvent(
      new MoneyWithdrawnEvent(this.id.value, amountMinor, operationId),
    );
    return 'withdrawn';
  }

  /** True when a deposit or withdrawal already used this operationId. */
  hasProcessedOperation(operationId: string): boolean {
    return this.processedOperations.has(operationId);
  }

  /**
   * True when this exact operation was already processed. Throws when the key
   * was used for a different type or amount, because one key must never be
   * shared across operations.
   */
  private isAlreadyProcessed(
    operationId: string,
    type: OperationType,
    amountMinor: number,
  ): boolean {
    const previous = this.processedOperations.get(operationId);
    if (previous === undefined) return false;

    if (previous.type !== type || previous.amountMinor !== amountMinor) {
      throw new OperationIdReusedError(operationId);
    }
    return true;
  }

  @EventHandler(AccountOpenedEvent)
  onAccountOpened(event: AccountOpenedEvent): void {
    this.id = AccountId.from(event.accountId);
    this.ownerName = event.ownerName;
    this.currency = event.currency;
  }

  @EventHandler(MoneyDepositedEvent)
  onMoneyDeposited(event: MoneyDepositedEvent): void {
    this.balanceMinor = addMinor(this.balanceMinor, event.amountMinor);
    this.processedOperations.set(event.operationId, {
      type: 'deposit',
      amountMinor: event.amountMinor,
    });
  }

  @EventHandler(MoneyWithdrawnEvent)
  onMoneyWithdrawn(event: MoneyWithdrawnEvent): void {
    this.balanceMinor = subtractMinor(this.balanceMinor, event.amountMinor);
    this.processedOperations.set(event.operationId, {
      type: 'withdrawal',
      amountMinor: event.amountMinor,
    });
  }
}
