import type { IEvent } from '@ocoda/event-sourcing';
import {
  InvalidAmountError,
  InvalidCurrencyError,
  InvalidOwnerNameError,
  OperationIdReusedError,
} from '../../shared/domain-errors.js';
import { AccountId } from './account-id.js';
import { Account } from './account.aggregate.js';
import { AccountOpenedEvent, MoneyDepositedEvent } from './account.events.js';

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
  });
});
