# Architecture

## Building blocks (Phase 2)

| Component | File | Responsibility |
|---|---|---|
| `Account` aggregate | `src/accounts/domain/account.aggregate.ts` | Consistency boundary for one account. Decision methods validate rules and `applyEvent`; only `@EventHandler` methods change state. No I/O. |
| Events | `src/accounts/domain/account.events.ts` | Immutable facts with stable stored names (`account-opened`, `money-deposited`) and plain JSON payloads. |
| `AccountRepository` | `src/accounts/infrastructure/account.repository.ts` | Load = replay the `account-<id>` stream. Save = append uncommitted events with `expectedVersion = committedVersion`. Maps Ocoda's version conflict to `ConcurrencyConflictError`. |
| Command handlers | `src/accounts/application/commands/` | `OpenAccount`, `DepositMoney`: load the aggregate, call one decision, save, return a small result. |
| Query handlers | `src/accounts/application/queries/` | `GetAccountState` (replay) and `GetAccountEventHistory` (`getEnvelopes`, the source of truth). |
| `GetDepositDetails` query | `src/accounts/application/queries/get-deposit-details.query.ts` | Scans the account stream (`getEvents`) for the `MoneyDeposited` with a given `operationId`. No events → `AccountNotFoundError`; events but no match → `DepositNotFoundError` (404 `DEPOSIT_NOT_FOUND`). Linear in stream length until Phase 3 adds a projection. |
| `AccountsController` | `src/accounts/api/` | HTTP → commands/queries; DTO validation via `ValidationPipe`. |
| `DomainExceptionFilter` | `src/shared/domain-exception.filter.ts` | Error `code` → HTTP status; anything else goes to Nest's default handling. |
| `EventStoreInitializer` | `src/event-store/` | Calls `ensureCollection()` at bootstrap so a fresh DB gets the `events` table. |

## Decisions

1. **Ocoda owns the event store.** We use `EventStore`, `EventStream`, `AggregateRoot` and the buses; no custom store.
2. **Money as safe integers in minor units.** Ocoda's JSON serializer can't store `bigint`; `Number.isSafeInteger` guards precision and the aggregate refuses overflow *before* emitting an event (an unreplayable event would be permanent).
3. **Rejections are exceptions, not events.** A rejected command changes nothing, so it leaves no fact. (The CodeWiz article stores `InsufficientFunds` events; we don't.)
4. **Idempotency inside the aggregate.** `operationId` is recorded in `MoneyDeposited`; replay rebuilds the set, so a retry after a timeout or crash can't double-deposit. The same key with a different amount is an error (409).
5. **Optimistic concurrency per stream.** Two writers that loaded the same version: the first append wins, the second gets 409 and writes nothing. Phase 3 adds bounded retry.
6. **Read-your-write from the aggregate.** Command responses return the balance from the aggregate just saved. Phase 3 projections will lag behind, which is expected.
7. **Swappable store module.** `AppModule.register(eventSourcing)` defaults to Postgres; fast tests pass `EventSourcingModule.forRoot({})` (in-memory).

## Confirmed Ocoda behaviour (observed in this repo)

- The Postgres table is `events(stream_id, version, event, payload jsonb, event_id, aggregate_id, occurred_on, global_position, …)`, PK `(stream_id, version)`.
- Event ids are ULIDs, and `global_position` starts at 1 per pool.
- `getEvents` / `getEnvelopes` / `readAll` return `AsyncGenerator<…[]>`, meaning they yield **batches**.
- The default JSON serializer round-trips our payloads into the event classes, so replay works.
- Vitest 4 in the NestJS 12 scaffold handles Ocoda decorators and Nest DI with no extra plugin (no `unplugin-swc` needed).

## Known limitations (so far)

- The idempotency map in `Account` grows with every deposit, which is fine at this scale. Production systems bound it or move it to a dedicated store.
- There's no snapshotting. Replay cost grows with stream length, and `GetAccountState` replays the whole stream on every call.
- A single currency per account, and no auth.
