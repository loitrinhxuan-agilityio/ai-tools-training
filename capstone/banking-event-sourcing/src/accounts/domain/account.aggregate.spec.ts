import type { IEvent } from '@ocoda/event-sourcing';
import {
  DomainError,
  InsufficientFundsError,
  InvalidAmountError,
  InvalidCurrencyError,
  InvalidOwnerNameError,
  OperationIdReusedError,
} from '../../shared/domain-errors.js';
import { AccountId } from './account-id.js';
import { Account } from './account.aggregate.js';
import {
  AccountOpenedEvent,
  MoneyDepositedEvent,
  MoneyWithdrawnEvent,
} from './account.events.js';

/*
 * Given (past events) / When (a decision) / Then (new events or an error).
 * This is how an event-sourced aggregate is specified: by events, not by
 * poking at internal state.
 */
const ACCOUNT_ID = AccountId.generate();

async function given(...events: IEvent[]): Promise<Account> {
  const account = new Account();
  await account.loadFromHistory(events);
  return account;
}

const opened = () => new AccountOpenedEvent(ACCOUNT_ID.value, 'Ada', 'EUR');

describe('Account aggregate', () => {
  describe('open', () => {
    it('emits AccountOpened with a trimmed owner name', () => {
      const account = Account.open(ACCOUNT_ID, '  Ada  ', 'EUR');

      expect(account.getUncommittedEvents()).toEqual([
        new AccountOpenedEvent(ACCOUNT_ID.value, 'Ada', 'EUR'),
      ]);
      expect(account.version).toBe(1);
      expect(account.committedVersion).toBe(0);
      expect(account.balanceMinor).toBe(0);
    });

    it('rejects a blank owner name', () => {
      expect(() => Account.open(ACCOUNT_ID, '   ', 'EUR')).toThrow(
        InvalidOwnerNameError,
      );
    });

    it('rejects an invalid currency', () => {
      expect(() => Account.open(ACCOUNT_ID, 'Ada', 'euro')).toThrow(
        InvalidCurrencyError,
      );
    });
  });

  describe('deposit', () => {
    it('emits MoneyDeposited and increases the balance', async () => {
      const account = await given(opened());

      expect(account.deposit(1050, 'op-1')).toBe('deposited');

      expect(account.getUncommittedEvents()).toEqual([
        new MoneyDepositedEvent(ACCOUNT_ID.value, 1050, 'op-1'),
      ]);
      expect(account.balanceMinor).toBe(1050);
    });

    it.each([0, -100, 10.5])('rejects amount %s without emitting events', async (amount) => {
      const account = await given(opened());

      expect(() => account.deposit(amount, 'op-1')).toThrow(InvalidAmountError);
      expect(account.getUncommittedEvents()).toEqual([]);
    });

    it('treats a repeated operationId as a no-op (idempotency)', async () => {
      const account = await given(
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, 500, 'op-1'),
      );

      expect(account.deposit(500, 'op-1')).toBe('duplicate');
      expect(account.getUncommittedEvents()).toEqual([]);
      expect(account.balanceMinor).toBe(500);
    });

    it('rejects a repeated operationId with a different amount', async () => {
      const account = await given(
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, 500, 'op-1'),
      );

      expect(() => account.deposit(900, 'op-1')).toThrow(OperationIdReusedError);
    });

    it('refuses a deposit whose resulting balance would lose precision', async () => {
      const account = await given(
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, Number.MAX_SAFE_INTEGER, 'op-1'),
      );

      expect(() => account.deposit(1, 'op-2')).toThrow(InvalidAmountError);
      expect(account.getUncommittedEvents()).toEqual([]);
    });
  });

  describe('withdraw', () => {
    it('emits MoneyWithdrawn and decreases the balance', async () => {
      const account = await given(
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, 1000, 'dep-1'),
      );

      expect(account.withdraw(400, 'wd-1')).toBe('withdrawn');

      expect(account.getUncommittedEvents()).toEqual([
        new MoneyWithdrawnEvent(ACCOUNT_ID.value, 400, 'wd-1'),
      ]);
      expect(account.balanceMinor).toBe(600);
    });

    it('allows withdrawing exactly the full balance, leaving zero', async () => {
      const account = await given(
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, 1000, 'dep-1'),
      );

      expect(account.withdraw(1000, 'wd-1')).toBe('withdrawn');

      expect(account.balanceMinor).toBe(0);
    });

    it('rejects an amount above the balance without emitting events', async () => {
      const account = await given(
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, 1000, 'dep-1'),
      );

      expect(() => account.withdraw(1001, 'wd-1')).toThrow(InsufficientFundsError);
      expect(account.getUncommittedEvents()).toEqual([]);
      expect(account.balanceMinor).toBe(1000);
    });

    it('rejects any withdrawal from an empty account', async () => {
      const account = await given(opened());

      expect(() => account.withdraw(1, 'wd-1')).toThrow(InsufficientFundsError);
      expect(account.getUncommittedEvents()).toEqual([]);
    });

    it.each([0, -100, 10.5])('rejects amount %s without emitting events', async (amount) => {
      const account = await given(
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, 1000, 'dep-1'),
      );

      expect(() => account.withdraw(amount, 'wd-1')).toThrow(InvalidAmountError);
      expect(account.getUncommittedEvents()).toEqual([]);
    });

    it('treats a repeated withdrawal operationId as a no-op (idempotency)', async () => {
      const account = await given(
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, 1000, 'dep-1'),
        new MoneyWithdrawnEvent(ACCOUNT_ID.value, 300, 'wd-1'),
      );

      expect(account.withdraw(300, 'wd-1')).toBe('duplicate');
      expect(account.getUncommittedEvents()).toEqual([]);
      expect(account.balanceMinor).toBe(700);
    });

    it('accepts a retry after success even when the balance has since dropped', async () => {
      // Funds check after idempotency: the retry must not fail with INSUFFICIENT_FUNDS.
      const account = await given(
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, 1000, 'dep-1'),
        new MoneyWithdrawnEvent(ACCOUNT_ID.value, 900, 'wd-1'),
      );

      expect(account.withdraw(900, 'wd-1')).toBe('duplicate');
      expect(account.balanceMinor).toBe(100);
    });

    it('rejects a repeated withdrawal operationId with a different amount', async () => {
      const account = await given(
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, 1000, 'dep-1'),
        new MoneyWithdrawnEvent(ACCOUNT_ID.value, 300, 'wd-1'),
      );

      expect(() => account.withdraw(200, 'wd-1')).toThrow(OperationIdReusedError);
      expect(account.getUncommittedEvents()).toEqual([]);
    });

    it('reports OperationIdReusedError before InsufficientFunds for a reused key', async () => {
      // Idempotency is checked first, so the conflict wins over the funds check.
      const account = await given(
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, 1000, 'dep-1'),
        new MoneyWithdrawnEvent(ACCOUNT_ID.value, 300, 'wd-1'),
      );

      expect(() => account.withdraw(5000, 'wd-1')).toThrow(OperationIdReusedError);
    });
  });

  describe('operationId shared across operation types', () => {
    it('rejects a withdrawal that reuses a deposit key with the same amount', async () => {
      const account = await given(opened());
      account.deposit(500, 'op-1');

      expect(() => account.withdraw(500, 'op-1')).toThrow(OperationIdReusedError);
      expect(account.getUncommittedEvents()).toEqual([
        new MoneyDepositedEvent(ACCOUNT_ID.value, 500, 'op-1'),
      ]);
    });

    it('rejects a deposit that reuses a withdrawal key with the same amount', async () => {
      const account = await given(
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, 1000, 'dep-1'),
      );
      account.withdraw(500, 'op-1');

      expect(() => account.deposit(500, 'op-1')).toThrow(OperationIdReusedError);
      expect(account.getUncommittedEvents()).toEqual([
        new MoneyWithdrawnEvent(ACCOUNT_ID.value, 500, 'op-1'),
      ]);
    });
  });

  describe('replay', () => {
    it('rebuilds the same state from history as was produced live', async () => {
      const live = Account.open(ACCOUNT_ID, 'Ada', 'EUR');
      live.deposit(1000, 'op-1');
      live.deposit(250, 'op-2');

      const replayed = await given(...live.getUncommittedEvents());

      expect(replayed.id.equals(live.id)).toBe(true);
      expect(replayed.ownerName).toBe(live.ownerName);
      expect(replayed.currency).toBe(live.currency);
      expect(replayed.balanceMinor).toBe(1250);
      expect(replayed.version).toBe(3);
      expect(replayed.committedVersion).toBe(3);
      expect(replayed.getUncommittedEvents()).toEqual([]);
      // Idempotency keys survive replay too.
      expect(replayed.deposit(250, 'op-2')).toBe('duplicate');
    });

    it('restores the balance and deposit key after replaying a withdrawal', async () => {
      const history = [
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, 1000, 'dep-1'),
        new MoneyWithdrawnEvent(ACCOUNT_ID.value, 400, 'wd-1'),
      ];
      const replayed = await given(...history);

      expect(replayed.balanceMinor).toBe(600);
      expect(replayed.version).toBe(3);
      expect(replayed.getUncommittedEvents()).toEqual([]);
      // Same-type retry after replay is a duplicate, not a new withdrawal.
      expect(replayed.withdraw(400, 'wd-1')).toBe('duplicate');
      expect(replayed.balanceMinor).toBe(600);
    });

    it('treats an overdrawn stored history as an invariant failure, not a domain error', async () => {
      // Only possible if corrupt history was stored. It must not look like a 400.
      const replayed = given(
        opened(),
        new MoneyWithdrawnEvent(ACCOUNT_ID.value, 100, 'wd-1'),
      );

      const error = await replayed.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(DomainError);
    });

    it('keeps the withdrawal key type-scoped after replaying a deposit', async () => {
      const replayed = await given(
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, 500, 'op-1'),
      );

      expect(() => replayed.withdraw(500, 'op-1')).toThrow(OperationIdReusedError);
      expect(replayed.getUncommittedEvents()).toEqual([]);
    });

    it('keeps the deposit key type-scoped after replaying a withdrawal', async () => {
      const replayed = await given(
        opened(),
        new MoneyDepositedEvent(ACCOUNT_ID.value, 1000, 'dep-1'),
        new MoneyWithdrawnEvent(ACCOUNT_ID.value, 500, 'op-1'),
      );

      expect(() => replayed.deposit(500, 'op-1')).toThrow(OperationIdReusedError);
      expect(replayed.getUncommittedEvents()).toEqual([]);
    });
  });
});
