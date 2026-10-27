# Baseline Test Report — Step 1

**Purpose:** Verify existing behavior before implementation of withdrawal history & visibility.
**Related:** [test-matrix.md](test-matrix.md) (TC-REG-001 to TC-REG-009)
**Status:** Baseline passes. No failing tests and no regressions found.

## Environment

- **Date and time:** 2026-10-27, 17:50–17:52 (+07)
- **Branch:** `feat/new-feature-kickoff` (created from `feat/banking-es-phase-2`)
- **Node:** 24.22.0 (from `.nvmrc`)
- **PostgreSQL:** 17.11 (`postgres:17` image, port 5433)
- **Working directory:** `capstone/banking-event-sourcing/`

## Commands and results

| Command | Result | Exit | Count / detail |
|---|---|---|---|
| `npm test` | Pass | 0 | 79 of 79 tests, 4 files |
| `npm run lint` | Pass | 0 | No findings |
| `npm run typecheck` | Pass | 0 | No errors |
| `npm run build` | Pass | 0 | Built with `nest build` |
| `npm run test:e2e` | Pass | 0 | 9 of 9 tests, 1 file |

**Failing tests:** None.

## PostgreSQL E2E setup

1. Created `.env` from `.env.example`. The file is git-ignored and holds the local docker-compose credentials.
2. Ran `docker compose up -d --wait`. The container reached healthy status.
3. Confirmed the server version is PostgreSQL 17.11.
4. Confirmed `TEST_DATABASE_URL` targets the `banking_test` database on port 5433, and that the `events` table exists there.
5. Ran `npm run test:e2e`.
6. Stopped services with `docker compose down`. The `-v` flag was not used, so the `banking-event-sourcing_pgdata` volume is kept.

## Regression case results (TC-REG-001 to TC-REG-009)

| Case | Result | Evidence |
|---|---|---|
| TC-REG-001 Existing suite | Pass | `npm test`: 79 of 79 |
| TC-REG-002 Insufficient funds | Pass | Aggregate throws `InsufficientFundsError` with no event appended. HTTP returns 422 with no event (`accounts.http.spec.ts`, aggregate spec, `money-withdrawn` E2E). |
| TC-REG-003 Duplicate retry | Pass | Aggregate returns `duplicate` with no uncommitted events. E2E: same-key retry that loses the race returns `duplicate`. |
| TC-REG-004 Reused key, different amount | Pass | Aggregate and HTTP: 409 `OPERATION_ID_REUSED`. |
| TC-REG-005 Concurrency | Pass | E2E: losing writer gets 409 `CONCURRENCY_CONFLICT`. Stale-version save is rejected. |
| TC-REG-006 Event names and payloads | Pass | E2E: stream rows are `account-opened`, `money-deposited`, `money-withdrawn`, with the expected payload. |
| TC-REG-007 Non-integer amounts | Pass | HTTP: 400 for `10.5` (request validation). Aggregate: `InvalidAmountError` with no events. |
| TC-REG-008 Event history endpoint | Pass | "returns the event history in stream order" (`accounts.http.spec.ts`). |
| TC-REG-009 Lint, typecheck, build | Pass | See the commands table above. |

## Matrix corrections made during this step

- **TC-REG-002:** expected result now separates the aggregate error from the HTTP 422 response.
- **TC-REG-007:** expected result no longer says `INVALID_AMOUNT` over HTTP. Over HTTP the response is 400 from request validation. `INVALID_AMOUNT` applies only at the aggregate level.

## Mapping limits (not independently verified)

- **TC-REG-008** asserts stream order only. "Unchanged from baseline" has no stored snapshot to compare against, so that part is not verified.
- **TC-REG-006** checks the event names and the withdrawal payload. The deposit and account-opened payloads are not separately asserted.
- **TC-REG-009** is a command-level result (exit codes), not a per-rule check.
- **TC-REG-001** is the broad suite result. Each other REG case is mapped to the named assertions above.

## Result vocabulary

Results follow the vocabulary in [test-matrix.md](test-matrix.md): PASS, FAIL, BLOCKED, NOT RUN. Across the 61 cases in the matrix, step 2 recorded **9 PASS, 0 FAIL, 18 BLOCKED, 34 NOT RUN**. The 9 PASS cases are TC-REG-001 to TC-REG-009. TC-REG-008 is recorded as PASS with the mapping limit above. TC-REG-010 and TC-REG-011 are NOT RUN, and every WH case is BLOCKED or NOT RUN.

## Notes

- The first lint run printed `ESLint output (JSON parse failed)`. That came from the RTK output filter, not the project. Running lint without the filter shows it passes.
- The `feature-kickoff/` folder contains eight files, not six. The extra two are `updated-open-questions.md` and `client-clarification-email.md`.
- Work is committed on `feat/new-feature-kickoff`: eight docs commits plus the `package-lock.json` chore commit. Nothing is pushed.
