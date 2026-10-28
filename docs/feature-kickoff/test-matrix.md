# Test Matrix — Withdrawal History & Visibility

**Status:** DRAFT for developer and QA review. Not final. Execution results recorded for step 2 (see [baseline-test-report.md](baseline-test-report.md)); round 2 cases have not been executed.
**Basis:** [tickets.md](tickets.md) acceptance criteria, which derive from [spec.md](spec.md), [updated-open-questions.md](updated-open-questions.md) (rounds 1 and 2), and [client-feedback.md](client-feedback.md).
**Note:** Client decisions are **simulated** for the Day 12 training exercise. They are not real client approval.

## Labels

Each test case has one planning label. Labels describe readiness and requirement status, not outcome.

- **CONFIRMED** — simulated client decision (round 1 or round 2), or existing behavior already in the codebase.
- **PROVISIONAL** — depends on a default still awaiting client confirmation (for example, the 90-day lookback or page size of 20).
- **ENG PROPOSAL** — engineering suggestion for developer review. Not a client requirement. Never promoted to CONFIRMED without a decision. (The expected HTTP status may be CONFIRMED while the error code is ENG PROPOSAL; the Notes column says so.)
- **OPEN** — depends on a decision not yet made. Test cannot be finalized.
- **BLOCKED** — depends on authentication, authorization, or another unresolved dependency. Cannot be released or marked passed.
- **RETIRED** — superseded by a round 2 decision. Kept for traceability; not executed.

## Execution status (readiness)

- **Run now** — can be executed against the current codebase (existing behavior).
- **Run after build** — needs the endpoint from the named ticket to exist.
- **Pending clarification** — cannot be run until the named decision is made.
- **Blocked** — cannot be run in a customer-facing or unauthenticated context until authentication exists.
- **Retired** — no longer applies.

## Result (outcome, step 2)

- **PASS** — test ran and the observed result matched the expected result.
- **FAIL** — test ran and the observed result differed from the expected result.
- **BLOCKED** — a dependency, unresolved decision, or gate prevents meaningful execution.
- **NOT RUN** — not executed yet. Applied to cases waiting on an unbuilt endpoint.
- **RETIRED** — superseded; not counted as pass or fail.

A CONFIRMED case can still be NOT RUN. A PASS requires a test that ran and an assertion that matches. A case with no mapped assertion is not PASS.

## Scope rule for this matrix

- A test that passes against an **unauthenticated** API does **not** prove that customers can only see their own accounts. Account scoping is tested at the query level only. Enforcement against a customer caller is **BLOCKED**.
- WH-04 tests are gated until audit storage, fields, and readers are decided, and until security review approves the audit-failure behavior. Their result is **BLOCKED** until then.
- Engineering proposals (error codes, cursor pagination, endpoint paths, clock tolerance, and the audit storage design) are not client requirements. Tests that depend on them stay ENG PROPOSAL until a developer accepts them.

## Test data notation

- `A` = an account with a known balance and history.
- `B` = a second account, used for scoping tests.
- `t1 < t2 < t3` = withdrawal timestamps, all successful unless stated.
- `now` = test run time. Day offsets are relative to `now`.

---

## WH-01 — Customer withdrawal history (list endpoint)

| ID | Ticket | Scenario | Preconditions / test data | Steps | Expected result | Label | Execution | Result | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-WH01-001 | WH-01 | Positive: list returns required fields only | `A` with 3 successful withdrawals | `GET /accounts/A/withdrawals` | 200; bare list; each item has exactly `amount`, `timestamp`, `operationId`, `status` | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-002 | WH-01 | Sorting: newest first | `A` with withdrawals at t1, t2, t3 | Call list with no filters | Order is t3, t2, t1 | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-003 | WH-01 | Negative: insufficient-funds attempt is not listed | `A` balance 100; withdraw 500 (rejected with 422) | Call list | No item for the rejected attempt | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-004 | WH-01 | Negative: reused `operationId` is not listed twice | `A` with one withdrawal `op-1`; repeat `op-1` with the same amount (returns `duplicate`) | Call list | Exactly one item for `op-1` | CONFIRMED | Run after build | NOT RUN | — | Round 1 D2 |
| TC-WH01-005 | WH-01 | Filter: status | — | — | — | RETIRED | Retired | RETIRED | — | Status filter dropped (round 2 Q1.1) |
| TC-WH01-006 | WH-01 | Filter: status values other than `succeeded` | — | — | — | RETIRED | Retired | RETIRED | — | No status filter (round 2 Q1.1); `pending`/`reversed` remain OPEN as a product item |
| TC-WH01-007 | WH-01 | Filter: date range returns only items in range | `A` with items at day -10, -5, -1 | `GET ...?from=<day -6>&to=<day -2>` | Only the day -5 item returned | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-008 | WH-01 | Boundary: date range endpoints are inclusive | `A` with an item at exactly `from` and one at exactly `to` | `GET ...?from=&to=` with those exact timestamps | Both items returned | CONFIRMED | Run after build | NOT RUN | — | Round 1 P1 (inclusive bounds) |
| TC-WH01-009 | WH-01 | Default lookback is 90 days | `A` with items at day -89, -91 | `GET ...` with no date params | Day -89 returned; day -91 not returned | PROVISIONAL | Run after build | NOT RUN | — | Default provisional; rolling window (round 2 Q3.3) |
| TC-WH01-010 | WH-01 | Boundary: item exactly at 90-day lookback edge | `A` with an item at day -90 (exact edge) | `GET ...` with no date params | Inclusive at the edge, as inclusive bounds imply | PROVISIONAL | Pending clarification | BLOCKED | — | Edge inclusivity needs client confirmation |
| TC-WH01-011 | WH-01 | Default page size is 20 | `A` with 25 successful withdrawals | `GET ...` with no page size | First page has 20 items; next page has 5 | PROVISIONAL | Run after build | NOT RUN | — | Default provisional |
| TC-WH01-012 | WH-01 | Pagination: no duplicates or gaps across pages | `A` with 25 withdrawals | Page through with next navigation until empty | All 25 unique items returned once each | ENG PROPOSAL | Run after build | NOT RUN | — | Cursor mechanism is engineering (2c item 2) |
| TC-WH01-013 | WH-01 | Empty account returns a bare empty list | `A` with no withdrawals | `GET ...` | 200; bare empty list | CONFIRMED | Run after build | NOT RUN | — | 2b item 1 |
| TC-WH01-014 | WH-01 | Negative: unknown account | Account ID that does not exist | `GET /accounts/<unknown>/withdrawals` | 404 `ACCOUNT_NOT_FOUND` | CONFIRMED | Run after build | NOT RUN | — | Same response as unauthorized account (round 1 P3) |
| TC-WH01-015 | WH-01 | Negative: malformed account ID | Account ID `not-a-valid-id` | `GET /accounts/not-a-valid-id/withdrawals` | 400 | CONFIRMED | Run after build | NOT RUN | — | Status confirmed; `INVALID_ID` code expectation conflicts with `ParseUUIDPipe` (see `developer-review.md`) |
| TC-WH01-016 | WH-01 | Account scoping: list contains only the requested account | `A` and `B` both have withdrawals | `GET /accounts/A/withdrawals` | No item belongs to `B` | CONFIRMED | Run after build | NOT RUN | — | Query scoping only |
| TC-WH01-017 | WH-01 | Account scoping: customer cannot request another customer's account | Customer session for `A`; `B` is a different account | `GET /accounts/B/withdrawals` as the customer | Request is refused with the same not-found as an unknown account | BLOCKED | Blocked | BLOCKED | — | Round 1 B1: ownership not defined |
| TC-WH01-018 | WH-01 | Field restriction: no failure reason in response | `A` with a rejected attempt and successful withdrawals | Call list | No item contains a failure reason field | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-019 | WH-01 | Field restriction: no raw event payloads | `A` with successful withdrawals | Call list | No item contains event type names or payload objects | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-020 | WH-01 | Field restriction: resulting balance is absent | `A` with successful withdrawals | Call list | No `balanceAfter` or similar field present | CONFIRMED | Run after build | NOT RUN | — | Round 1 D1 |
| TC-WH01-021 | WH-01 | Boundary: page size above maximum | `A` with 60 withdrawals | `GET ...?pageSize=101` | 200 with at most 100 items | CONFIRMED | Run after build | NOT RUN | — | Round 2 Q4.1 (cap at 100) |
| TC-WH01-022 | WH-01 | Release gate: customer endpoint not exposed | Production-like customer environment | Customer calls list endpoint | Endpoint must not be reachable without authentication | BLOCKED | Blocked | BLOCKED | — | 2c item 3; SEC-01 |
| TC-WH01-023 | WH-01 | Negative: invalid page size | `A` with 25 withdrawals | `GET ...?pageSize=0`, `=-1`, `=10.5`, `=abc` | 400 for each | CONFIRMED | Run after build | NOT RUN | — | Round 2 Q4.2 and 2b item 7; error code ENG PROPOSAL |
| TC-WH01-024 | WH-01 | Negative: invalid date values | `A` | `GET ...?to=<future>`; `?from=<future>`; `?from=2026-10-01T00:00:00` (no timezone); `?from=not-a-date` | 400 for each | CONFIRMED | Run after build | NOT RUN | — | 2c item 1 (future dates), 2b item 6 (timezone); error code ENG PROPOSAL |
| TC-WH01-025 | WH-01 | Boundary: one-sided date ranges | `A` with items at day -200, -10, -1 | `GET ...?from=<day -15>` (no `to`); `GET ...?to=<day -5>` (no `from`) | `from`-only returns items from day -15 to now; `to`-only returns all items up to day -5 from start of history | CONFIRMED | Run after build | NOT RUN | — | Round 2 Q3.1 and Q3.2 |
| TC-WH01-026 | WH-01 | Boundary: `from = to` | `A` with an item at exactly time T; another at date-only day D | `GET ...?from=T&to=T`; `GET ...?from=D&to=D` | Item at T returned; date-only D returns the whole UTC day D | CONFIRMED | Run after build | NOT RUN | — | 2b item 6 (date-only and instant equality) |

## WH-02 — Support lookup by account and `operationId`

| ID | Ticket | Scenario | Preconditions / test data | Steps | Expected result | Label | Execution | Result | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-WH02-001 | WH-02 | Positive: lookup returns the withdrawal with WH-01 fields | `A` with withdrawal `op-1`; valid case ID | `GET /support/accounts/A/withdrawals/op-1?<case-ID parameter, OPEN>=<id>` | 200; fields `amount`, `timestamp`, `operationId`, `status` only | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built; case-ID parameter name and location OPEN |
| TC-WH02-002 | WH-02 | Scoping: `operationId` belongs to another account | `op-B1` belongs to `B`; valid case ID | `GET /support/accounts/A/withdrawals/op-B1` | 404; `B`'s data not returned | CONFIRMED | Run after build | NOT RUN | — | Status confirmed (round 1 P3); code `WITHDRAWAL_NOT_FOUND` ENG PROPOSAL |
| TC-WH02-003 | WH-02 | Negative: `operationId` of a rejected attempt | `A`; insufficient-funds attempt with `op-fail` | `GET /support/accounts/A/withdrawals/op-fail` | 404; failed attempt not returned | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH02-004 | WH-02 | Negative: unknown `operationId` | `A`; no `op-missing` | `GET /support/accounts/A/withdrawals/op-missing` | 404 | CONFIRMED | Run after build | NOT RUN | — | Status confirmed; code ENG PROPOSAL |
| TC-WH02-005 | WH-02 | Negative: unknown account | Account ID that does not exist | `GET /support/accounts/<unknown>/withdrawals/op-1` | 404 `ACCOUNT_NOT_FOUND` | CONFIRMED | Run after build | NOT RUN | — | Same response as unauthorized (round 1 P3) |
| TC-WH02-006 | WH-02 | Negative: malformed account ID | `not-a-valid-id` | `GET /support/accounts/not-a-valid-id/withdrawals/op-1` | 400 | CONFIRMED | Run after build | NOT RUN | — | `INVALID_ID` code expectation conflicts with `ParseUUIDPipe` |
| TC-WH02-007 | WH-02 | No raw event payloads in support response | `A` with `op-1` | Lookup `op-1` | No event type names or payload objects | CONFIRMED | Run after build | NOT RUN | — | Round 1 D4 |
| TC-WH02-008 | WH-02 | Support field set matches WH-01 | `A` with `op-1` | Lookup `op-1`; compare with WH-01 item | Same field set | CONFIRMED | Run after build | NOT RUN | — | Round 1 D6 |
| TC-WH02-009 | WH-02 | No action endpoints exist | `A` with `op-1` | `POST`, `PUT`, `PATCH`, `DELETE` on `/support/accounts/A/withdrawals/op-1` | Each returns 404 or 405; no action is performed | CONFIRMED | Run after build | NOT RUN | — | Round 1 Q4 |
| TC-WH02-010 | WH-02 | Cross-account support lookup | Support session with an authorized role; `A` and `B` both exist | Support looks up `B`'s withdrawal while scoped to `A`, or any cross-account lookup | Allowed only for an authorized role; otherwise refused | BLOCKED | Blocked | BLOCKED | — | Round 1 B2: role tiers OPEN |
| TC-WH02-011 | WH-02 | Lookup produces an audit record | `A` with `op-1`; valid case ID | Lookup `op-1` as support | One audit record with staff ID, account, query, timestamp, case ID | PROVISIONAL | Pending clarification | BLOCKED | — | WH-04 audit gate |
| TC-WH02-012 | WH-02 | Negative: missing case ID | `A` with `op-1` | `GET /support/accounts/A/withdrawals/op-1` (no case ID) | 400; attempt is audited as rejected | CONFIRMED | Run after build | NOT RUN | — | Round 2 Q2.4 (case ID); 2c item 6 (rejected attempt audited); code ENG PROPOSAL |
| TC-WH02-013 | WH-02 | Case ID with optional note | `A` with `op-1` | Lookup with a valid case ID and optional note (parameter names OPEN) | 200; note appears in audit record, not in response body | CONFIRMED | Run after build | NOT RUN | — | Round 1 D6; round 2 Q2.3; format OPEN |

## WH-03 — Support lookup by account and date range

| ID | Ticket | Scenario | Preconditions / test data | Steps | Expected result | Label | Execution | Result | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-WH03-001 | WH-03 | Positive: range returns only matching items | `A` with items at day -10, -5, -1; valid case ID | `GET /support/accounts/A/withdrawals?from=<day -6>&to=<day -2>&<case-ID parameter, OPEN>=<id>` | Only the day -5 item returned | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH03-002 | WH-03 | Boundary: `from` equals `to` | `A` with an item at exactly time T; valid case ID | `GET ...?from=T&to=T` | Item at T returned (inclusive) | CONFIRMED | Run after build | NOT RUN | — | 2b item 6 |
| TC-WH03-003 | WH-03 | Negative: `from` after `to` | `A`; valid case ID | `GET ...?from=<day -1>&to=<day -10>` | 400 | CONFIRMED | Run after build | NOT RUN | — | Round 2 Q3.5; code `INVALID_DATE_RANGE` ENG PROPOSAL |
| TC-WH03-004 | WH-03 | Negative: malformed date | `A`; valid case ID | `GET ...?from=not-a-date` | 400 | CONFIRMED | Run after build | NOT RUN | — | Round 2 Q3.6; code ENG PROPOSAL |
| TC-WH03-005 | WH-03 | Range with no matching items | `A` with no items in range; valid case ID | `GET ...?from=&to=` | 200; bare empty list | CONFIRMED | Run after build | NOT RUN | — | 2b item 1 |
| TC-WH03-006 | WH-03 | Default lookback applies only without dates | `A` with items at day -89 and day -91; valid case ID | `GET ...` with no `from` or `to` | Day -89 returned; day -91 not returned | PROVISIONAL | Run after build | NOT RUN | — | Default provisional |
| TC-WH03-007 | WH-03 | Failed attempts not in range results | `A`; rejected attempt inside the range | `GET ...?from=&to=` covering the attempt | Rejected attempt not returned | CONFIRMED | Run after build | NOT RUN | — | Round 1 Q2 |
| TC-WH03-008 | WH-03 | Cross-account range lookup | Support session with an authorized role; `A` and `B` both exist | Support lists `B` while scoped to `A`, or any cross-account lookup | Allowed only for an authorized role | BLOCKED | Blocked | BLOCKED | — | Round 1 B2 |
| TC-WH03-009 | WH-03 | Range lookup produces an audit record | `A` with items; valid case ID | Range lookup as support | Audit record exists | PROVISIONAL | Pending clarification | BLOCKED | — | WH-04 audit gate |
| TC-WH03-010 | WH-03 | Negative: missing case ID | `A` | `GET ...?from=&to=` (no case ID) | 400; attempt is audited as rejected | CONFIRMED | Run after build | NOT RUN | — | Round 2 Q2.4 (case ID); 2c item 6 (rejected attempt audited); code ENG PROPOSAL |

## WH-04 — Audit of customer and support lookups

Every WH-04 result is **BLOCKED** until audit storage, audit fields, audit readers, and the security review of audit-failure behavior are decided.

| ID | Ticket | Scenario | Preconditions / test data | Steps | Expected result | Label | Execution | Result | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-WH04-001 | WH-04 | Each WH-02 lookup writes an audit record | Support performs one lookup | Lookup by `operationId` | One audit record created | PROVISIONAL | Pending clarification | BLOCKED | — | WH-04 audit gate |
| TC-WH04-002 | WH-04 | Each WH-03 lookup writes an audit record | Support performs one range lookup | Lookup by date range | One audit record created | PROVISIONAL | Pending clarification | BLOCKED | — | WH-04 audit gate |
| TC-WH04-003 | WH-04 | Customer page request writes one audit record | Customer lists own history with two pages | Call WH-01 endpoint twice | Two audit records, one per page request, with customer ID, account, query params, timestamp, result count | CONFIRMED | Pending clarification | BLOCKED | — | Round 2 Q2.1–Q2.2; reverses earlier "no customer audit" |
| TC-WH04-004 | WH-04 | Audit write failure blocks the read | Audit storage unavailable (simulated) | Customer or support performs a lookup | Lookup fails; no data returned | CONFIRMED | Pending clarification | BLOCKED | — | 2b item 4; subject to security review |
| TC-WH04-005 | WH-04 | Audit fields match the minimum set | Support performs a lookup | Inspect audit record | Fields include staff ID, account, query, timestamp, case ID, note | OPEN | Pending clarification | BLOCKED | — | Exact schema OPEN |
| TC-WH04-006 | WH-04 | Audit record captures caller identity | Support performs a lookup | Inspect audit record | Caller identity recorded | BLOCKED | Blocked | BLOCKED | — | Round 1 B1, B2: authentication not implemented |
| TC-WH04-007 | WH-04 | Audit records are not on the account stream | Support performs a lookup | Inspect event store for `account-<id>` | No audit event appended | OPEN | Pending clarification | BLOCKED | — | Storage location OPEN |
| TC-WH04-008 | WH-04 | Audit read access is restricted | Audit records exist | Attempt to read audit records as a non-auditor | Access refused | OPEN | Pending clarification | BLOCKED | — | Round 1 B2: audit readers OPEN |
| TC-WH04-009 | WH-04 | Denied access is audited | Customer requests another account, or support without role requests a lookup | Send request | Refused with not-found; one audit record for the denied attempt | CONFIRMED | Pending clarification | BLOCKED | — | 2c item 6 |
| TC-WH04-010 | WH-04 | Rejected support lookup is audited | Support lookup with missing or invalid case ID | Send request | 400; one audit record for the rejected attempt | CONFIRMED | Pending clarification | BLOCKED | — | 2c item 6 |
| TC-WH04-011 | WH-04 | Empty-result lookup audit | Lookup with no matches | Send request | Audit behavior | OPEN | Pending clarification | BLOCKED | — | 2c item 6: deferred to audit design review |

## SEC-01 — Route protection and raw event history

| ID | Ticket | Scenario | Preconditions / test data | Steps | Expected result | Label | Execution | Result | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-SEC-001 | SEC-01 | Unauthenticated write routes are refused | No credentials | `POST /accounts`, `POST /accounts/:id/deposits`, `POST /accounts/:id/withdrawals` | 401 or 403 for each; no event appended | CONFIRMED | Blocked | BLOCKED | — | 2c item 3; mechanism OPEN |
| TC-SEC-002 | SEC-01 | Unauthenticated read routes are refused | No credentials | `GET /accounts/:id`, `GET /accounts/:id/deposits/:operationId` | 401 or 403 for each | CONFIRMED | Blocked | BLOCKED | — | 2c item 3 |
| TC-SEC-003 | SEC-01 | Raw event history is restricted | Credentials for a non-internal role; credentials for an authorized internal role | `GET /accounts/:id/events` with each | Non-internal role refused; internal role receives the history | CONFIRMED | Blocked | BLOCKED | — | 2c item 4; role OPEN |

## Cross-cutting regression tests

These protect existing behavior from the spec's section 4.1. They run against the current codebase.

| ID | Ticket | Scenario | Preconditions / test data | Steps | Expected result | Label | Execution | Result | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-REG-001 | Cross-cutting | Existing unit and HTTP suite passes | Current codebase | `npm test` | All existing tests pass (currently 79) | CONFIRMED (existing) | Run now | PASS | `npm test`: 79 of 79 passed, 4 files (2026-10-27 17:50) | Broad suite result; per-case mappings below. Authentication changes will require test updates (SEC-01). |
| TC-REG-002 | Cross-cutting | Insufficient funds persists no event | Aggregate with balance below amount | `withdraw` with larger amount | Aggregate throws `InsufficientFundsError`; no event appended. Over HTTP, `POST /accounts/:id/withdrawals` returns 422 with no event | CONFIRMED (existing) | Run now | PASS | `account.aggregate.spec.ts` "rejects an amount above the balance without emitting events"; `accounts.http.spec.ts` "rejects an amount above the balance with 422 and writes no event"; `test/accounts.e2e-spec.ts` "does not persist a rejected withdrawal (insufficient funds)" | Mapped to assertions |
| TC-REG-003 | Cross-cutting | Reused `operationId` returns `duplicate` | Withdrawal `op-1` applied | Repeat `op-1` with same amount | Returns `duplicate`; no new event | CONFIRMED (existing) | Run now | PASS | `account.aggregate.spec.ts` "treats a repeated withdrawal operationId as a no-op (idempotency)"; `test/accounts.e2e-spec.ts` "answers a same-key retry that loses the append race with duplicate, not a conflict" | Mapped to assertions |
| TC-REG-004 | Cross-cutting | Reused `operationId` with different amount raises `OPERATION_ID_REUSED` | Withdrawal `op-1` applied | Repeat `op-1` with different amount | `OPERATION_ID_REUSED` (HTTP 409) | CONFIRMED (existing) | Run now | PASS | `account.aggregate.spec.ts` "rejects a repeated withdrawal operationId with a different amount"; `accounts.http.spec.ts` "rejects reuse of a withdrawal operationId with a different amount (409)" | Mapped to assertions |
| TC-REG-005 | Cross-cutting | Concurrency conflict maps to 409 | Two writers on the same stream | Concurrent appends | One succeeds; the other returns 409 `CONCURRENCY_CONFLICT` | CONFIRMED (existing) | Run now (needs PostgreSQL, `npm run test:e2e`) | PASS | `test/accounts.e2e-spec.ts` "gives the losing HTTP writer 409 CONCURRENCY_CONFLICT when both loaded the same version"; "rejects a save based on a stale version (optimistic concurrency)". PostgreSQL 17.11, `banking_test` | Mapped to assertions |
| TC-REG-006 | Cross-cutting | Event names and payloads unchanged | Current event definitions | Inspect `account.events.ts` against baseline | `account-opened`, `money-deposited`, `money-withdrawn` unchanged | CONFIRMED (existing) | Run now | PASS | `test/accounts.e2e-spec.ts` "persists a withdrawal as a money-withdrawn row with the expected payload" | Deposit payload not separately asserted |
| TC-REG-007 | Cross-cutting | Money values reject non-integers | Withdraw `10.5` | `POST /accounts/A/withdrawals` with `10.5` | Over HTTP, rejected with 400 by request validation. At the aggregate level, `withdraw(10.5)` throws `InvalidAmountError` and emits no events | CONFIRMED (existing) | Run now | PASS | `accounts.http.spec.ts` "rejects invalid withdrawal body {"amountMinor":10.5,...} (400)"; `account.aggregate.spec.ts` "rejects amount 10.5 without emitting events" | Mapped to assertions |
| TC-REG-008 | Cross-cutting | Raw event history endpoint returns stream order | `A` with events | `GET /accounts/A/events` | Response in stream order | CONFIRMED (existing) | Run now | PASS | `accounts.http.spec.ts` "returns the event history in stream order" | **Partially verified:** asserts stream order only. The test calls the route without credentials; it must be updated when SEC-01 restricts the route (2c item 4). |
| TC-REG-009 | Cross-cutting | Lint, typecheck, and build pass | Current codebase | `npm run lint`, `npm run typecheck`, `npm run build` | All pass | CONFIRMED (existing) | Run now | PASS | `npm run lint` exit 0; `npm run typecheck` exit 0; `npm run build` exit 0 | Command-level results |
| TC-REG-010 | Cross-cutting | Error codes mapped only in `DomainExceptionFilter` | New code added | Code review and search for new error mappings | No mapping outside the filter | CONFIRMED (existing rule) | Run after build | NOT RUN | — | No new code yet |
| TC-REG-011 | Cross-cutting | Money stored as integer minor units in new paths | New read paths | Inspect returned amounts | All amounts are integers | CONFIRMED (existing rule) | Run after build | NOT RUN | — | No new read paths yet |

## Coverage summary (planning labels)

| Ticket | Test cases | CONFIRMED | PROVISIONAL | ENG PROPOSAL | OPEN | BLOCKED | RETIRED |
|---|---|---|---|---|---|---|---|
| WH-01 | 26 | 18 | 3 | 1 | 0 | 2 | 2 |
| WH-02 | 13 | 11 | 1 | 0 | 0 | 1 | 0 |
| WH-03 | 10 | 7 | 2 | 0 | 0 | 1 | 0 |
| WH-04 | 11 | 4 | 2 | 0 | 4 | 1 | 0 |
| SEC-01 | 3 | 3 | 0 | 0 | 0 | 0 | 0 |
| Regression | 11 | 11 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **74** | **54** | **8** | **1** | **4** | **5** | **2** |

Each case has one planning label. The label for each case is the one in its row; the summary above counts those labels. Labels describe requirement status. Cases with ENG PROPOSAL in the Notes column mean the HTTP status is client-decided and the error code is not.

**Scope of coverage:**
- Positive, negative, boundary, filtering (date only), sorting, pagination, account scoping, audit, route protection, and regression cases are all present.
- Customer-side, cross-account, and route-protection enforcement cases are BLOCKED. They cannot be marked passed against an unauthenticated API.

## Execution results (step 2 and round 2)

Counts reconcile to 74. Retired cases are not counted as pass or fail. Round 2 cases have not been executed.

| Result | Regression | WH-01 | WH-02 | WH-03 | WH-04 | SEC-01 | Total |
|---|---|---|---|---|---|---|---|
| PASS | 9 | 0 | 0 | 0 | 0 | 0 | **9** |
| FAIL | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| BLOCKED | 0 | 3 | 2 | 2 | 11 | 3 | **21** |
| NOT RUN | 2 | 21 | 11 | 8 | 0 | 0 | **42** |
| RETIRED | 0 | 2 | 0 | 0 | 0 | 0 | **2** |
| **Total** | **11** | **26** | **13** | **10** | **11** | **3** | **74** |

**Mapping limits (not independently verified):**
- TC-REG-008 asserts stream order only. "Unchanged from baseline" has no stored snapshot to compare against.
- TC-REG-006 checks event names and the withdrawal payload. The deposit and account-opened payloads are not separately asserted.
- TC-REG-009 is a command-level result (exit codes), not a per-rule check.
- TC-WH01-015 and TC-WH02-006 expect 400 with `INVALID_ID`. The current `:id` routes use `ParseUUIDPipe` and return 400 with no `code` field.

## Unresolved decisions that block tests

| Decision | Blocks |
|---|---|
| Customer authentication and ownership (round 1 B1) | TC-WH01-017, TC-WH01-022, TC-WH04-006 |
| Support role tiers and audit readers (round 1 B2, B4) | TC-WH02-010, TC-WH03-008, TC-WH04-008 |
| Route protection mechanism (2c item 3) | TC-SEC-001, TC-SEC-002, TC-WH01-022 |
| Raw event history role (2c item 4) | TC-SEC-003, TC-REG-008 |
| Audit storage, fields, and failure security review | TC-WH04-004, TC-WH04-005, TC-WH04-007 |
| Empty-result auditing (2c item 6) | TC-WH04-011 |
| Response field name `amount` vs `amountMinor` (OPEN) | TC-WH01-001, TC-WH02-001, TC-WH03-001 (field assertions) |
| 90-day window edge inclusivity | TC-WH01-010 |
| Engineering proposals (error codes, cursor pagination, clock tolerance) | Accepted by developers before these tests are marked CONFIRMED in their error-code assertions |

## Can run now vs later

**Run now (against the current codebase):**
- TC-REG-001 through TC-REG-009. Results recorded in step 2. TC-REG-005 needs PostgreSQL (`docker compose up -d --wait`, then `npm run test:e2e`).

**Run after build (once WH-01 to WH-03 endpoints exist):**
- All WH-01, WH-02, and WH-03 cases not marked Blocked, Pending clarification, or Retired.
- TC-REG-010 and TC-REG-011.

**Pending clarification (cannot run until a decision is made):**
- TC-WH01-010.
- TC-WH02-011, TC-WH03-009 (audit, depends on WH-04).
- All WH-04 cases.

**Blocked (cannot be run in a customer-facing or unauthenticated context):**
- TC-WH01-017, TC-WH01-022, TC-WH02-010, TC-WH03-008, TC-WH04-006.
- TC-SEC-001, TC-SEC-002, TC-SEC-003.

**Retired:**
- TC-WH01-005, TC-WH01-006.

## Next steps

1. Developers review the ENG PROPOSAL items and the malformed-ID expectation (TC-WH01-015, TC-WH02-006).
2. Security reviewer designs authentication, authorization, route protection, and audit. Then SEC-01 and WH-04 move from BLOCKED or OPEN.
3. Client confirms the PROVISIONAL defaults and remaining OPEN items.
4. After WH-01 to WH-03 are built, run the NOT RUN cases. Keep release gated on SEC-01 and WH-04.
