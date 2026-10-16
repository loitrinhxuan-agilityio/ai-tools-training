import { Aggregate, AggregateRoot, EventHandler } from '@ocoda/event-sourcing';
import {
  InvalidOwnerNameError,
  OperationIdReusedError,
} from '../../shared/domain-errors.js';
import {
  addMinor,
  assertCurrencyCode,
  assertPositiveMinorAmount,
} from '../../shared/money.js';
import { AccountId } from './account-id.js';
import { AccountOpenedEvent, MoneyDepositedEvent } from './account.events.js';

export type DepositResult = 'deposited' | 'duplicate';

/**
 * The consistency boundary for one bank account (stream `account-<id>`).
 *
 * Decision methods (`open`, `deposit`) validate business rules and then call
 * `applyEvent`. Only `@EventHandler` methods change state, so replaying the
 * stored events rebuilds exactly the same state. No I/O happens here.
 */
@Aggregate({ streamName: 'account' })
export class Account extends AggregateRoot {
  id: AccountId;
  ownerName: string;
  currency: string;
  balanceMinor = 0;

  /** operationId -> amount, so a retried request is recognised and ignored. */
  private readonly processedOperations = new Map<string, number>();

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

    const previousAmount = this.processedOperations.get(operationId);
    if (previousAmount !== undefined) {
      if (previousAmount !== amountMinor) {
        throw new OperationIdReusedError(operationId);
      }
      return 'duplicate';
    }

    // Check overflow before emitting, so we never store an unreplayable event.
    addMinor(this.balanceMinor, amountMinor);
    this.applyEvent(
      new MoneyDepositedEvent(this.id.value, amountMinor, operationId),
    );
    return 'deposited';
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
    this.processedOperations.set(event.operationId, event.amountMinor);
  }
}
