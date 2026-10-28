# Deposit flow walkthrough

Walkthrough of `POST /accounts/:id/deposits` in the Phase 2 code. Line references
and test counts were checked against the source files and a test run on 2026-10-20.
See "Verification status" at the end for what was executed.

## 1. End-to-end request flow

Request body: `{ amountMinor, operationId }`.

1. **Controller** (`src/accounts/api/accounts.controller.ts:48-57`): `ParseUUIDPipe`
   checks the account id. The global `ValidationPipe` validates the DTO
   (`src/accounts/api/account.dto.ts:23-34`). The controller sends a
   `DepositMoneyCommand` through `CommandBus`.
2. **Handler** (`src/accounts/application/commands/deposit-money.command.ts:31-45`):
   loads the aggregate, calls `account.deposit(...)`, then saves it.
3. **Load** (`src/accounts/infrastructure/account.repository.ts:24-34`): replays the
   stream `account-<id>`. An empty stream throws `AccountNotFoundError`.
4. **Decision** (`src/accounts/domain/account.aggregate.ts:49-66`):
   - `assertPositiveMinorAmount`: the amount must be an integer greater than 0.
   - Same `operationId` and same amount: returns `'duplicate'` and emits nothing.
   - Same `operationId` and different amount: throws `OperationIdReusedError`.
   - `addMinor` checks for overflow, then `applyEvent(MoneyDepositedEvent)`.
5. **Save** (`account.repository.ts:36-54`): appends the new events with
   `expectedVersion = committedVersion`. A version conflict becomes
   `ConcurrencyConflictError`.
6. **Response** (`deposit-money.command.ts:39-44`): `{ accountId, operationId, status,
   balanceMinor }`, taken from the aggregate, not a read model.

## 2. Key files and responsibilities

| File | Responsibility |
|---|---|
| `api/accounts.controller.ts` | HTTP to command. No business logic. |
| `api/account.dto.ts` | Input shape: integer, positive amount; `operationId` 1–100 characters |
| `application/commands/deposit-money.command.ts` | Command, result type, handler |
| `domain/account.aggregate.ts` | Business rules and idempotency |
| `domain/account.events.ts` | `money-deposited` event (`accountId`, `amountMinor`, `operationId`) |
| `infrastructure/account.repository.ts` | Replay on load; optimistic append on save |
| `shared/money.ts` | `assertPositiveMinorAmount`, `addMinor` |
| `shared/domain-errors.ts` | Error codes |
| `shared/domain-exception.filter.ts` | Maps error codes to HTTP status |

## 3. Persistence and replay

- **Write:** one row per new event. The e2e test checks an account opened and one
  deposit: version 2, event `money-deposited`, payload
  `{ accountId, amountMinor: 1050, operationId: 'op-1' }`
  (`test/accounts.e2e-spec.ts:51-69`).
- **Replay:** `@EventHandler(MoneyDepositedEvent)` adds the amount to the balance and
  records `operationId` in the map (`account.aggregate.ts:75-79`). The same code runs
  live and on replay, so the idempotency map is rebuilt from events.

## 4. Invalid deposits and duplicate operation IDs

| Case | Result | Where it is decided |
|---|---|---|
| Amount `0`, negative, `10.5`, a string, missing field, or extra field | 400 | DTO and `assertPositiveMinorAmount` |
| Balance would exceed `Number.MAX_SAFE_INTEGER` | 400 `INVALID_AMOUNT` | `addMinor`, before any event is emitted |
| Unknown account | 404 `ACCOUNT_NOT_FOUND` | `getById` |
| Malformed account id | 400 | `ParseUUIDPipe` |
| Same `operationId`, same amount (retry) | 200, `status: 'duplicate'`, no new event | Aggregate |
| Same `operationId`, different amount | 409 `OPERATION_ID_REUSED` | Aggregate |
| Concurrent writers | 409 `CONCURRENCY_CONFLICT`, nothing written (the 409 mapping is not tested over HTTP) | Repository, then `DomainExceptionFilter` |

## 5. Test coverage

| Layer | Tests | What they check |
|---|---|---|
| Aggregate unit (`src/accounts/domain/account.aggregate.spec.ts`) | 7 deposit cases (4 tests, 3 of them parameterised over `0`, `-100`, `10.5`), 1 replay test | Event and balance; `0`, `-100`, `10.5` rejected with no event; duplicate is a no-op; reuse with a different amount; overflow; replay gives the same state and still dedupes |
| HTTP, in-memory store (`src/accounts/accounts.http.spec.ts`) | 19 cases in total. Deposit-related: retry no-op, reuse gives 409, 6 invalid deposit bodies give 400, unknown account gives 404 on the deposit route. Lookup route (`GET .../deposits/:operationId`): 6 cases, including the 100-character boundary and the 400 for a 101-character id. Also: a malformed-id 400 (on a GET route) and an open-account 400 | The retry test asserts two events in total |
| E2E, Postgres (`test/accounts.e2e-spec.ts`) | 3 tests | Row shape; stale-version conflict (repository level); balance survives an app restart |

## 6. Gaps

1. **Concurrent identical retries.** If two requests with the same `operationId` load
   before either saves, the second gets 409 `CONCURRENCY_CONFLICT`, not `duplicate`.
   The client has to retry. No test covers this. The stale-version e2e test covers the
   conflict mechanism, but with different `operationId`s. The 409 behaviour is inferred
   from the code and has not been run. Bounded retry is planned for Phase 3
   (`docs/architecture.md`, decision 5).
2. **Deduplication across a restart.** The restart test asserts balance and version only,
   not that a retry after restart returns `duplicate`. The dedup-after-replay check exists
   only in memory (`account.aggregate.spec.ts`, the replay test). Confirmed by searching the
   test files.
3. **Overflow over HTTP.** The overflow rule is tested at the aggregate level only. No HTTP
   test uses `MAX_SAFE_INTEGER`. Confirmed by searching the test files.
4. **Retries against Postgres.** No e2e test checks that a duplicate retry writes no row.
   Confirmed by reading the e2e file. The repository skips the append when there are no
   new events (`account.repository.ts:37-38`), so none is expected.

## Implemented vs planned

- **Implemented:** deposit, `operationId` idempotency, replay, optimistic concurrency
  with 409 (the repository conflict is tested; the HTTP 409 mapping is read from the
  filter, not tested), and the error mapping above.
- **Planned, not built:** bounded retry on conflict, the balance read model,
  withdrawals, and transfers. The current `balanceMinor` comes from replaying the stream.

## Verification status

- **Executed (Node 24.22.0, 2026-10-20):** `npm test`: 44 of 44 passed across 4 files.
  `npm run typecheck` and `npm run lint`: clean.
- **Last recorded, not re-run on 2026-10-20:** `npm run test:e2e` against Postgres 17 via
  `docker compose`: 3 of 3 passed. Docker was not running on the review date, so this
  result predates the current HEAD (`a4319af`) and is not confirmed for it.
- **Checked by reading:** line numbers and event names against the source; HTTP statuses
  against the controller decorators and the exception filter.
- **Not run:** `npm run build`; the four gaps as scenarios (confirmed by searching the
  tests, not by running them).
