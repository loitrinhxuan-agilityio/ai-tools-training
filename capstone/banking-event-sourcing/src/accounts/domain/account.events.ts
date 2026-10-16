import { Event, type IEvent } from '@ocoda/event-sourcing';

/*
 * Events are immutable facts in the past tense. Each has an explicit, stable
 * name: it is what gets stored, so renaming a class must not orphan old events.
 * Payloads hold plain JSON values only (strings, integers), so the default
 * JSON serializer can round-trip them.
 */

@Event('account-opened')
export class AccountOpenedEvent implements IEvent {
  constructor(
    public readonly accountId: string,
    public readonly ownerName: string,
    public readonly currency: string,
  ) {}
}

@Event('money-deposited')
export class MoneyDepositedEvent implements IEvent {
  constructor(
    public readonly accountId: string,
    public readonly amountMinor: number,
    /** Client-supplied idempotency key for this deposit. */
    public readonly operationId: string,
  ) {}
}

export const ACCOUNT_EVENTS = [AccountOpenedEvent, MoneyDepositedEvent];
