# Test Matrix — Withdrawal History & Visibility

**Status:** DRAFT for developer and QA review. Not final. Execution results recorded for step 2 (see [baseline-test-report.md](baseline-test-report.md)).
**Basis:** [tickets.md](tickets.md) acceptance criteria, which derive from [spec.md](spec.md), [client-feedback.md](client-feedback.md), and [open-questions.md](open-questions.md).
**Note:** Client decisions come from simulated feedback for the Day 12 training simulation. They are not real client approval.

## Labels

Each test case has one planning label. Labels follow the tickets and spec. They describe readiness and requirement status, not outcome.

- **CONFIRMED** — agreed for the training demo, or existing behavior already in the codebase.
- **PROVISIONAL** — depends on a default still awaiting client confirmation (for example, the 90-day lookback or page size of 20).
- **ENG PROPOSAL** — engineering suggestion for developer review. Not a client requirement. Never promoted to CONFIRMED without a decision.
- **OPEN** — depends on a decision not yet made. Test cannot be finalized.
- **BLOCKED** — depends on access control (Q5) or another unresolved dependency. Cannot be released or marked passed.

## Execution status (readiness)

- **Run now** — can be executed against the current codebase (existing behavior).
- **Run after build** — needs the endpoint from the named ticket to exist.
- **Pending clarification** — cannot be run until the named decision is made.
- **Blocked** — cannot be run in a customer-facing or unauthenticated context until access control exists.

## Result (outcome, step 2)

- **PASS** — test ran and the observed result matched the expected result.
- **FAIL** — test ran and the observed result differed from the expected result.
- **BLOCKED** — a dependency, unresolved decision, or gate prevents meaningful execution. Applied to OPEN and BLOCKED labels, the WH-04 audit gate, and pending-clarification cases.
- **NOT RUN** — not executed yet. Applied to cases waiting on an unbuilt endpoint or an unaccepted engineering proposal.

A CONFIRMED case can still be NOT RUN. A PASS requires a test that ran and an assertion that matches. The `Evidence` column names the test or command; a case with no mapped assertion is not PASS.

## Scope rule for this matrix

- A test that passes against an **unauthenticated** API does **not** prove that customers can only see their own accounts. Account scoping is tested at the query level only. Enforcement against a customer caller is **BLOCKED (Q5)**.
- WH-04 tests are **PROVISIONAL** until audit fields, audit storage, and caller identity are decided. Their result is **BLOCKED** (audit gate) until then.
- Engineering proposals (error codes `WITHDRAWAL_NOT_FOUND` and `INVALID_DATE_RANGE`, cursor pagination, empty list, audit-failure behavior, and the endpoint paths) are not client requirements. Tests that depend on them stay ENG PROPOSAL until a developer accepts them.

## Test data notation

- `A` = an account with a known balance and history.
- `B` = a second account, used for scoping tests.
- `t1 < t2 < t3` = withdrawal timestamps, all successful unless stated.
- `now` = test run time. Day offsets are relative to `now`.

---

## WH-01 — Customer withdrawal history (list endpoint)

| ID | Ticket | Scenario | Preconditions / test data | Steps | Expected result | Label | Execution | Result | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-WH01-001 | WH-01 | Positive: list returns required fields only | `A` with 3 successful withdrawals | `GET /accounts/A/withdrawals` | 200; each item has exactly `amount`, `timestamp`, `operationId`, `status` | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-002 | WH-01 | Sorting: newest first | `A` with withdrawals at t1, t2, t3 | Call list with no filters | Order is t3, t2, t1 | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-003 | WH-01 | Negative: insufficient-funds attempt is not listed | `A` balance 100; withdraw 500 (rejected with 422) | Call list | No item for the rejected attempt | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-004 | WH-01 | Negative: reused `operationId` is not listed twice | `A` with one withdrawal `op-1`; repeat `op-1` with the same amount (returns `duplicate`) | Call list | Exactly one item for `op-1` | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-005 | WH-01 | Filter: status `succeeded` | `A` with successful withdrawals | `GET ...?status=succeeded` | Only successful items returned | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-006 | WH-01 | Filter: status values other than `succeeded` | `A` with successful withdrawals | `GET ...?status=pending` and `?status=reversed` | Behavior undefined | OPEN (Q2) | Pending clarification | BLOCKED | — | Q2: status values undecided |
| TC-WH01-007 | WH-01 | Filter: date range returns only items in range | `A` with items at day -10, -5, -1 | `GET ...?from=<day -6>&to=<day -2>` | Only the day -5 item returned | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-008 | WH-01 | Boundary: date range endpoints are inclusive | `A` with an item at exactly `from` and one at exactly `to` | `GET ...?from=&to=` with those exact timestamps | Both items returned | ENG PROPOSAL | Run after build | NOT RUN | — | Endpoint not built; awaiting developer acceptance |
| TC-WH01-009 | WH-01 | Default lookback is 90 days | `A` with items at day -89, -91 | `GET ...` with no date params | Day -89 returned; day -91 not returned | PROVISIONAL | Run after build | NOT RUN | — | Endpoint not built; default provisional |
| TC-WH01-010 | WH-01 | Boundary: item exactly at 90-day lookback edge | `A` with an item at day -90 (exact edge) | `GET ...` with no date params | Behavior at exact edge awaits client confirmation of inclusivity | PROVISIONAL | Pending clarification | BLOCKED | — | Q3: edge inclusivity undecided |
| TC-WH01-011 | WH-01 | Default page size is 20 | `A` with 25 successful withdrawals | `GET ...` with no page size | First page has 20 items; next page has 5 | PROVISIONAL | Run after build | NOT RUN | — | Endpoint not built; default provisional |
| TC-WH01-012 | WH-01 | Pagination: no duplicates or gaps across pages | `A` with 25 withdrawals | Page through with the next-page cursor until empty | All 25 unique items returned once each | ENG PROPOSAL | Run after build | NOT RUN | — | Endpoint not built; awaiting developer acceptance |
| TC-WH01-013 | WH-01 | Empty account returns empty list | `A` with no withdrawals | `GET ...` | 200 with empty list, not an error | ENG PROPOSAL | Run after build | NOT RUN | — | Endpoint not built; awaiting developer acceptance |
| TC-WH01-014 | WH-01 | Negative: unknown account | Account ID that does not exist | `GET /accounts/<unknown>/withdrawals` | 404 `ACCOUNT_NOT_FOUND` | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-015 | WH-01 | Negative: malformed account ID | Account ID `not-a-valid-id` | `GET /accounts/not-a-valid-id/withdrawals` | 400 `INVALID_ID` | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-016 | WH-01 | Account scoping: list contains only the requested account | `A` and `B` both have withdrawals | `GET /accounts/A/withdrawals` | No item belongs to `B` | CONFIRMED (query scoping) | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-017 | WH-01 | Account scoping: customer cannot request another customer's account | Customer session for `A`; `B` is a different account | `GET /accounts/B/withdrawals` as the customer | Request is refused | BLOCKED (Q5) | Blocked | BLOCKED | — | Q5: access control not implemented |
| TC-WH01-018 | WH-01 | Field restriction: no failure reason in response | `A` with a rejected attempt and successful withdrawals | Call list | No item contains a failure reason field | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-019 | WH-01 | Field restriction: no raw event payloads | `A` with successful withdrawals | Call list | No item contains event type names or payload objects | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH01-020 | WH-01 | Field restriction: resulting balance is absent | `A` with successful withdrawals | Call list | No `balanceAfter` or similar field present | OPEN (Q1) | Pending clarification | BLOCKED | — | Q1: balance field undecided |
| TC-WH01-021 | WH-01 | Boundary: page size above maximum | `A` with 60 withdrawals | `GET ...?pageSize=100` | Behavior undefined; maximum not decided | OPEN (Q3) | Pending clarification | BLOCKED | — | Q3: page size maximum undecided |
| TC-WH01-022 | WH-01 | Release gate: customer endpoint not exposed | Production-like customer environment | Customer calls list endpoint | Endpoint must not be reachable without access control | BLOCKED (Q5) | Blocked | BLOCKED | — | Q5: access control gate |

## WH-02 — Support lookup by account and `operationId`

| ID | Ticket | Scenario | Preconditions / test data | Steps | Expected result | Label | Execution | Result | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-WH02-001 | WH-02 | Positive: lookup returns the withdrawal with WH-01 fields | `A` with withdrawal `op-1` | `GET /support/accounts/A/withdrawals/op-1` | 200; fields `amount`, `timestamp`, `operationId`, `status` only | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH02-002 | WH-02 | Scoping: `operationId` belongs to another account | `op-B1` belongs to `B` | `GET /support/accounts/A/withdrawals/op-B1` | 404 `WITHDRAWAL_NOT_FOUND`; `B`'s data not returned | ENG PROPOSAL | Run after build | NOT RUN | — | Endpoint not built; awaiting developer acceptance |
| TC-WH02-003 | WH-02 | Negative: `operationId` of a rejected attempt | `A`; insufficient-funds attempt with `op-fail` | `GET /support/accounts/A/withdrawals/op-fail` | 404; failed attempt not returned | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH02-004 | WH-02 | Negative: unknown `operationId` | `A`; no `op-missing` | `GET /support/accounts/A/withdrawals/op-missing` | 404 `WITHDRAWAL_NOT_FOUND` | ENG PROPOSAL | Run after build | NOT RUN | — | Endpoint not built; awaiting developer acceptance |
| TC-WH02-005 | WH-02 | Negative: unknown account | Account ID that does not exist | `GET /support/accounts/<unknown>/withdrawals/op-1` | 404 `ACCOUNT_NOT_FOUND` | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH02-006 | WH-02 | Negative: malformed account ID | `not-a-valid-id` | `GET /support/accounts/not-a-valid-id/withdrawals/op-1` | 400 `INVALID_ID` | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH02-007 | WH-02 | No raw event payloads in support response | `A` with `op-1` | Lookup `op-1` | No event type names or payload objects | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH02-008 | WH-02 | Support field set matches WH-01 | `A` with `op-1` | Lookup `op-1`; compare with WH-01 item | Same field set | CONFIRMED (fields to be confirmed) | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH02-009 | WH-02 | No action endpoints exist | `A` with `op-1` | `POST`, `PUT`, `PATCH`, `DELETE` on `/support/accounts/A/withdrawals/op-1` | Each returns 404 or 405; no action is performed | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH02-010 | WH-02 | Cross-account support lookup | Support session; `A` and `B` both exist | Support looks up `B`'s withdrawal while scoped to `A`, or any cross-account lookup | Depends on support access rule | BLOCKED (Q5) | Blocked | BLOCKED | — | Q5: access control not implemented |
| TC-WH02-011 | WH-02 | Lookup produces an audit record | `A` with `op-1` | Lookup `op-1` as support | Audit record exists | PROVISIONAL (WH-04) | Pending clarification | BLOCKED | — | WH-04 audit gate |

## WH-03 — Support lookup by account and date range

| ID | Ticket | Scenario | Preconditions / test data | Steps | Expected result | Label | Execution | Result | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-WH03-001 | WH-03 | Positive: range returns only matching items | `A` with items at day -10, -5, -1 | `GET /support/accounts/A/withdrawals?from=<day -6>&to=<day -2>` | Only the day -5 item returned | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH03-002 | WH-03 | Boundary: `from` equals `to` | `A` with an item at exactly time T | `GET ...?from=T&to=T` | Item at T returned (inclusive) | ENG PROPOSAL | Run after build | NOT RUN | — | Endpoint not built; awaiting developer acceptance |
| TC-WH03-003 | WH-03 | Negative: `from` after `to` | `A` | `GET ...?from=<day -1>&to=<day -10>` | 400 `INVALID_DATE_RANGE` | ENG PROPOSAL | Run after build | NOT RUN | — | Endpoint not built; awaiting developer acceptance |
| TC-WH03-004 | WH-03 | Negative: malformed date | `A` | `GET ...?from=not-a-date` | 400 (validation error); exact code not decided | ENG PROPOSAL | Run after build | NOT RUN | — | Endpoint not built; awaiting developer acceptance |
| TC-WH03-005 | WH-03 | Range with no matching items | `A` with no items in range | `GET ...?from=&to=` | 200 with empty list | ENG PROPOSAL | Run after build | NOT RUN | — | Endpoint not built; awaiting developer acceptance |
| TC-WH03-006 | WH-03 | Default lookback applies only without dates | `A` with items at day -89 and day -91 | `GET ...` with no `from` or `to` | Day -89 returned; day -91 not returned | PROVISIONAL | Run after build | NOT RUN | — | Endpoint not built; default provisional |
| TC-WH03-007 | WH-03 | Failed attempts not in range results | `A`; rejected attempt inside the range | `GET ...?from=&to=` covering the attempt | Rejected attempt not returned | CONFIRMED | Run after build | NOT RUN | — | Endpoint not built |
| TC-WH03-008 | WH-03 | Cross-account range lookup | Support session; `A` and `B` both exist | Support lists `B` while scoped to `A`, or any cross-account lookup | Depends on support access rule | BLOCKED (Q5) | Blocked | BLOCKED | — | Q5: access control not implemented |
| TC-WH03-009 | WH-03 | Range lookup produces an audit record | `A` with items | Range lookup as support | Audit record exists | PROVISIONAL (WH-04) | Pending clarification | BLOCKED | — | WH-04 audit gate |

## WH-04 — Audit of support lookups

All WH-04 tests are **PROVISIONAL** until the audit fields, storage location, and caller identity are decided. None can be marked passed until then. Their result is **BLOCKED** under the audit gate.

| ID | Ticket | Scenario | Preconditions / test data | Steps | Expected result | Label | Execution | Result | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-WH04-001 | WH-04 | Each WH-02 lookup writes an audit record | Support performs one lookup | Lookup by `operationId` | One audit record created | PROVISIONAL | Pending clarification | BLOCKED | — | WH-04 audit gate |
| TC-WH04-002 | WH-04 | Each WH-03 lookup writes an audit record | Support performs one range lookup | Lookup by date range | One audit record created | PROVISIONAL | Pending clarification | BLOCKED | — | WH-04 audit gate |
| TC-WH04-003 | WH-04 | Customer list writes no audit record | Customer lists own history | Call WH-01 endpoint | No audit record | ENG PROPOSAL | Pending clarification | BLOCKED | — | WH-04 audit gate |
| TC-WH04-004 | WH-04 | Audit write failure fails the lookup | Audit storage unavailable (simulated) | Support performs a lookup | Lookup fails; no data returned | ENG PROPOSAL | Pending clarification | BLOCKED | — | WH-04 audit gate |
| TC-WH04-005 | WH-04 | Audit fields match the minimum set | Support performs a lookup | Inspect audit record | Fields match the agreed minimum | OPEN (audit fields) | Pending clarification | BLOCKED | — | Audit fields undecided |
| TC-WH04-006 | WH-04 | Audit record captures caller identity | Support performs a lookup | Inspect audit record | Caller identity recorded | BLOCKED (Q5) | Blocked | BLOCKED | — | Q5: access control not implemented |
| TC-WH04-007 | WH-04 | Audit records are not on the account stream | Support performs a lookup | Inspect event store for `account-<id>` | No audit event appended | OPEN (storage location) | Pending clarification | BLOCKED | — | Audit storage location undecided |
| TC-WH04-008 | WH-04 | Audit read access is restricted | Audit records exist | Attempt to read audit records as a non-auditor | Access refused | OPEN (audit access) | Pending clarification | BLOCKED | — | Audit access undecided |

## Cross-cutting regression tests

These protect existing behavior from the spec's section 4.1. They run against the current codebase.

| ID | Ticket | Scenario | Preconditions / test data | Steps | Expected result | Label | Execution | Result | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-REG-001 | Cross-cutting | Existing unit and HTTP suite passes | Current codebase | `npm test` | All existing tests pass (currently 79) | CONFIRMED (existing) | Run now | PASS | `npm test`: 79 of 79 passed, 4 files (2026-10-27 17:50) | Broad suite result; per-case mappings below |
| TC-REG-002 | Cross-cutting | Insufficient funds persists no event | Aggregate with balance below amount | `withdraw` with larger amount | Aggregate throws `InsufficientFundsError`; no event appended. Over HTTP, `POST /accounts/:id/withdrawals` returns 422 with no event (the domain error is mapped to 422) | CONFIRMED (existing) | Run now | PASS | `account.aggregate.spec.ts` "rejects an amount above the balance without emitting events"; `accounts.http.spec.ts` "rejects an amount above the balance with 422 and writes no event"; `test/accounts.e2e-spec.ts` "does not persist a rejected withdrawal (insufficient funds)" | Mapped to assertions |
| TC-REG-003 | Cross-cutting | Reused `operationId` returns `duplicate` | Withdrawal `op-1` applied | Repeat `op-1` with same amount | Returns `duplicate`; no new event | CONFIRMED (existing) | Run now | PASS | `account.aggregate.spec.ts` "treats a repeated withdrawal operationId as a no-op (idempotency)" (checks `duplicate` and no uncommitted events); `test/accounts.e2e-spec.ts` "answers a same-key retry that loses the append race with duplicate, not a conflict" | Mapped to assertions |
| TC-REG-004 | Cross-cutting | Reused `operationId` with different amount raises `OPERATION_ID_REUSED` | Withdrawal `op-1` applied | Repeat `op-1` with different amount | `OPERATION_ID_REUSED` (HTTP 409) | CONFIRMED (existing) | Run now | PASS | `account.aggregate.spec.ts` "rejects a repeated withdrawal operationId with a different amount"; `accounts.http.spec.ts` "rejects reuse of a withdrawal operationId with a different amount (409)" | Mapped to assertions |
| TC-REG-005 | Cross-cutting | Concurrency conflict maps to 409 | Two writers on the same stream | Concurrent appends | One succeeds; the other returns 409 `CONCURRENCY_CONFLICT` | CONFIRMED (existing) | Run now (needs PostgreSQL, `npm run test:e2e`) | PASS | `test/accounts.e2e-spec.ts` "gives the losing HTTP writer 409 CONCURRENCY_CONFLICT when both loaded the same version"; "rejects a save based on a stale version (optimistic concurrency)". PostgreSQL 17.11, `banking_test` | Mapped to assertions |
| TC-REG-006 | Cross-cutting | Event names and payloads unchanged | Current event definitions | Inspect `account.events.ts` against baseline | `account-opened`, `money-deposited`, `money-withdrawn` unchanged | CONFIRMED (existing) | Run now | PASS | `test/accounts.e2e-spec.ts` "persists a withdrawal as a money-withdrawn row with the expected payload" (checks version, event name, and payload in stream `account-<id>`) | Names checked in stream; deposit payload not separately asserted |
| TC-REG-007 | Cross-cutting | Money values reject non-integers | Withdraw `10.5` | `POST /accounts/A/withdrawals` with `10.5` | Over HTTP, rejected with 400 by request validation (not a domain error code). At the aggregate level, `withdraw(10.5)` throws `InvalidAmountError` (`INVALID_AMOUNT`) and emits no events | CONFIRMED (existing) | Run now | PASS | `accounts.http.spec.ts` "rejects invalid withdrawal body {"amountMinor":10.5,...} (400)"; `account.aggregate.spec.ts` "rejects amount 10.5 without emitting events" | Mapped to assertions |
| TC-REG-008 | Cross-cutting | Raw event history endpoint unchanged | `A` with events | `GET` account event history | Response unchanged from baseline | CONFIRMED (existing) | Run now | PASS | `accounts.http.spec.ts` "returns the event history in stream order" | **Partially verified:** asserts stream order only. No stored baseline response exists, so "unchanged" is not independently verified |
| TC-REG-009 | Cross-cutting | Lint, typecheck, and build pass | Current codebase | `npm run lint`, `npm run typecheck`, `npm run build` | All pass | CONFIRMED (existing) | Run now | PASS | `npm run lint` exit 0 (`oxlint --type-aware src/ test/`); `npm run typecheck` exit 0; `npm run build` exit 0 | Command-level results |
| TC-REG-010 | Cross-cutting | Error codes mapped only in `DomainExceptionFilter` | New code added | Code review and search for new error mappings | No mapping outside the filter | CONFIRMED (existing rule) | Run after build | NOT RUN | — | No new code yet |
| TC-REG-011 | Cross-cutting | Money stored as integer minor units in new paths | New read paths | Inspect returned amounts | All amounts are integers | CONFIRMED (existing rule) | Run after build | NOT RUN | — | No new read paths yet |

## Coverage summary (planning labels)

| Ticket | Test cases | CONFIRMED | PROVISIONAL | ENG PROPOSAL | OPEN | BLOCKED |
|---|---|---|---|---|---|---|
| WH-01 | 22 | 11 | 3 | 3 | 3 | 2 |
| WH-02 | 11 | 7 | 1 | 2 | 0 | 1 |
| WH-03 | 9 | 2 | 2 | 4 | 0 | 1 |
| WH-04 | 8 | 0 | 2 | 2 | 3 | 1 |
| Regression | 11 | 11 | 0 | 0 | 0 | 0 |
| **Total** | **61** | **31** | **8** | **11** | **6** | **5** |

Each case has one planning label in the table. The WH-04 rows keep their per-case labels (for example, OPEN or BLOCKED), but all of them stay gated under the WH-04 rule above: none can be marked passed until the audit decisions are made.

**Scope of coverage:**
- Positive, negative, boundary, filtering, sorting, pagination, account scoping, and regression cases are all present.
- Customer-side and cross-account enforcement cases exist but are BLOCKED on Q5. They cannot be marked passed against an unauthenticated API.

## Execution results (step 2)

Counts reconcile to 61. Unrun cases are not counted as passed.

| Result | Regression | WH-01 | WH-02 | WH-03 | WH-04 | Total |
|---|---|---|---|---|---|---|
| PASS | 9 | 0 | 0 | 0 | 0 | **9** |
| FAIL | 0 | 0 | 0 | 0 | 0 | **0** |
| BLOCKED | 0 | 6 | 2 | 2 | 8 | **18** |
| NOT RUN | 2 | 16 | 9 | 7 | 0 | **34** |
| **Total** | **11** | **22** | **11** | **9** | **8** | **61** |

**Mapping limits (not independently verified):**
- TC-REG-008 asserts stream order only. "Unchanged from baseline" has no stored snapshot to compare against.
- TC-REG-006 checks event names and the withdrawal payload. The deposit and account-opened payloads are not separately asserted.
- TC-REG-009 is a command-level result (exit codes), not a per-rule check.

## Unresolved decisions that block tests

| Decision | Blocks |
|---|---|
| Access control (Q5) | TC-WH01-017, TC-WH01-022, TC-WH02-010, TC-WH03-008, TC-WH04-006 |
| Status values beyond `succeeded` (Q2) | TC-WH01-006 |
| Resulting balance field (Q1) | TC-WH01-020 |
| Page size maximum (Q3) | TC-WH01-021 |
| Default lookback edge inclusivity (Q3) | TC-WH01-010 |
| Audit fields, storage, and access | TC-WH04-005, TC-WH04-007, TC-WH04-008 |
| Engineering proposals (error codes, cursor pagination, empty list, audit failure) | Accepted by developers before these tests are marked CONFIRMED |

## Can run now vs later

**Run now (against the current codebase):**
- TC-REG-001 through TC-REG-009. Results recorded in step 2. TC-REG-005 needs PostgreSQL (`docker compose up -d --wait`, then `npm run test:e2e`).

**Run after build (once WH-01 to WH-03 endpoints exist):**
- All WH-01, WH-02, and WH-03 cases not marked Blocked or Pending clarification.
- TC-REG-010 and TC-REG-011.

**Pending clarification (cannot run until a decision is made):**
- TC-WH01-006, TC-WH01-010, TC-WH01-020, TC-WH01-021.
- TC-WH02-011 and TC-WH03-009 (audit, depends on WH-04).
- All WH-04 cases.

**Blocked (cannot be run in a customer-facing or unauthenticated context):**
- TC-WH01-017, TC-WH01-022, TC-WH02-010, TC-WH03-008, TC-WH04-006.

## Next steps

1. Developers review the engineering proposals and mark accepted ones CONFIRMED or reject them.
2. Client confirms the PROVISIONAL defaults and answers the OPEN questions.
3. After WH-01 to WH-03 are built, run the NOT RUN cases. Keep release gated on access control and the audit decisions.
