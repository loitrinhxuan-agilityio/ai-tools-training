# Architecture

## Building blocks (Phase 2)

| Component | File | Responsibility |
|---|---|---|
| `Account` aggregate | `src/accounts/domain/account.aggregate.ts` | Consistency boundary for one account. Decision methods validate rules and `applyEvent`; only `@EventHandler` methods change state. No I/O. |
| Events | `src/accounts/domain/account.events.ts` | Immutable facts with stable stored names (`account-opened`, `money-deposited`, `money-withdrawn`) and plain JSON payloads. |
| `AccountRepository` | `src/accounts/infrastructure/account.repository.ts` | Load = replay the `account-<id>` stream. Save = append uncommitted events with `expectedVersion = committedVersion`. Maps Ocoda's version conflict to `ConcurrencyConflictError`. |
| Command handlers | `src/accounts/application/commands/` | `OpenAccount`, `DepositMoney`, `WithdrawMoney`: load the aggregate, call one decision, save, return a small result. |
| Query handlers | `src/accounts/application/queries/` | `GetAccountState` (replay) and `GetAccountEventHistory` (`getEnvelopes`, the source of truth). |
| `GetDepositDetails` query | `src/accounts/application/queries/get-deposit-details.query.ts` | Scans the account stream (`getEvents`) for the `MoneyDeposited` with a given `operationId`. No events → `AccountNotFoundError`; events but no match → `DepositNotFoundError` (404 `DEPOSIT_NOT_FOUND`). Linear in stream length until Phase 3 adds a projection. |
| `GetWithdrawalHistory` query | `src/accounts/application/queries/get-withdrawal-history.query.ts` | One account's successful withdrawals (`money-withdrawn` envelopes), newest first, paged by stream version, filtered by date range. Reads the whole stream and pages in memory. **Not registered in a module, no route, not audited.** |
| `GetWithdrawalDetails` query | `src/accounts/application/queries/get-withdrawal-details.query.ts` | Finds one withdrawal by `operationId` (404 `WITHDRAWAL_NOT_FOUND`). Run through `SupportLookupAuditor`. **Not registered, no route.** |
| `ListSupportWithdrawals` query | `src/accounts/application/queries/list-support-withdrawals.query.ts` | Validates raw `from`/`to`/page size (`src/shared/date-range.ts`, `page-params.ts`), then reuses the history read. Run through `SupportLookupAuditor`. **Not registered, no route.** |
| `AccountsController` | `src/accounts/api/` | HTTP → commands/queries; DTO validation via `ValidationPipe` (unknown properties are rejected with 400). Marks the raw-events route with `@RequireRole`. |
| `AuthGuard` | `src/auth/auth.guard.ts` | Global guard (`APP_GUARD`, wired by `AuthModule`): every route needs a valid HS256 bearer token with `sub`, `role`, `iat`, `exp`, the expected issuer and audience, and an age of at most 15 minutes. `@RequireRole` adds a role check. Only `INTERNAL_SUPPORT` is recognised (`roles.ts`). |
| `SupportLookupAuditor` | `src/audit/support-lookup-auditor.ts` | Runs a support read, then writes one audit row (`success` or `rejected`). If the write fails, the caller gets `AuditUnavailableError` and no data. |
| `AuditWriter` / `PgAuditWriter` | `src/audit/` | Port and PostgreSQL adapter for the `audit_records` table. `AuditModule` is global but exports only the auditor, so nothing can append audit rows without going through it. `AuditTableInitializer` creates the table at startup if it is missing. |
| `DomainExceptionFilter` | `src/shared/domain-exception.filter.ts` | Error `code` → HTTP status (including 401 with a `WWW-Authenticate` challenge, 403, and 503 for `AUDIT_UNAVAILABLE`); anything else goes to Nest's default handling. |
| `EventStoreInitializer` | `src/event-store/` | Calls `ensureCollection()` at bootstrap so a fresh DB gets the `events` table. |

## Decisions

1. **Ocoda owns the event store.** We use `EventStore`, `EventStream`, `AggregateRoot` and the buses; no custom store.
2. **Money as safe integers in minor units.** Ocoda's JSON serializer can't store `bigint`; `Number.isSafeInteger` guards precision and the aggregate refuses overflow *before* emitting an event (an unreplayable event would be permanent).
3. **Rejections are exceptions, not events.** A rejected command changes nothing, so it leaves no fact. An overdraft attempt throws `InsufficientFundsError` (422) and writes no `money-withdrawn`. (The CodeWiz article stores `InsufficientFunds` events; we don't.)
4. **Idempotency inside the aggregate.** `operationId` is recorded in `MoneyDeposited` and `MoneyWithdrawn`; replay rebuilds the map, so a retry after a timeout or crash can't double-apply. The map stores `{ type, amountMinor }` per key. A retry matches only when both the operation type and the amount are the same. Any other match (a different amount, or a deposit key reused for a withdrawal or the reverse) is an error (409 `OPERATION_ID_REUSED`). For withdrawals, the idempotency check runs before the funds check, so a retry of a completed withdrawal is a `duplicate` even when the balance has since dropped.
5. **Optimistic concurrency per stream.** Two writers that loaded the same version: the first append wins, the second gets 409 and writes nothing. For withdrawals this is what stops overdraft: both writers may pass the funds check on the same balance, but only one append succeeds. Phase 3 adds bounded retry.
6. **Read-your-write from the aggregate.** Command responses return the balance from the aggregate just saved. Phase 3 projections will lag behind, which is expected.
7. **Swappable store module.** `AppModule.register(eventSourcing, auth, audit)` defaults to Postgres, `AuthModule.forRoot()` and `AuditModule.forRoot()`; fast tests pass `EventSourcingModule.forRoot({})` (in-memory), `AuthModule.forSecret(...)` with a test key, and `AuditModule.forWriter(...)` with an in-memory writer.
8. **Authentication is global and fails closed.** The guard is an `APP_GUARD`, so a new route is protected unless it is deliberately opened. Failures are `DomainError`s mapped to HTTP only in the filter. The signing key comes from `JWT_SECRET`; startup fails if it is missing or weak. Rotation is manual (change the key, restart; every token becomes invalid at once).
9. **Audit lives outside the event store.** Audit rows go to a separate `audit_records` table, never to an `account-<id>` stream, so they cannot change account history or replay. One row per attempt, including rejected ones. The read runs first and the row is written before data is returned; if the write fails or exceeds `AUDIT_WRITE_TIMEOUT_MS` (default 2 s), the lookup returns 503 and no data (fail closed).
10. **Unexpected read failures are recorded as `rejected` with `READ_FAILED`.** This keeps the outcome set to `success`, `denied`, `rejected`. `denied` is reserved for guard refusals, which are not audited yet.

## Confirmed Ocoda behaviour (observed in this repo)

- The Postgres table is `events(stream_id, version, event, payload jsonb, event_id, aggregate_id, occurred_on, global_position, …)`, PK `(stream_id, version)`.
- Event ids are ULIDs, and `global_position` starts at 1 per pool.
- `getEvents` / `getEnvelopes` / `readAll` return `AsyncGenerator<…[]>`, meaning they yield **batches**.
- The default JSON serializer round-trips our payloads into the event classes, so replay works.
- Vitest 4 in the NestJS 12 scaffold handles Ocoda decorators and Nest DI with no extra plugin (no `unplugin-swc` needed).

## Known limitations (so far)

- The idempotency map in `Account` grows with every deposit, which is fine at this scale. Production systems bound it or move it to a dedicated store.
- There's no snapshotting. Replay cost grows with stream length, and `GetAccountState` replays the whole stream on every call.
- A single currency per account.
- Authentication exists, but there is no token issuer and no named owner for the signing key. Issuer and audience values are implementer defaults, not confirmed. Only the `INTERNAL_SUPPORT` role is recognised, and there is no customer identity or account-ownership check.
- The withdrawal handlers have no routes. Each history read scans the whole stream; the cost has not been measured.
- Audit gaps: a write that times out may still commit, so a row can say `success` while the caller got 503 (the row records that the read completed, not that data was delivered). Not built: case-ID validation, auditing of guard 403 denials, customer-side audit, an audit-reader role, retention, and an append-only grant for the app database role (the app creates the table itself).
