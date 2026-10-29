# Developer Review — Withdrawal History & Visibility

**Purpose:** Technical review of the read path and engineering proposals before implementation. Review and documentation only.
**Status:** Recommendations only. **Nothing in this document is approved.** Every decision below is OPEN or RECOMMENDED until an authorized person records approval.
**Inputs:** [spec.md](spec.md), [tickets.md](tickets.md), [test-matrix.md](test-matrix.md), `CLAUDE.md`, and the code cited below.
**Scope:** No application code, dependencies, or commits were changed for this review.

## Status meanings

- **OPEN** — no recommendation yet, or a decision is still needed.
- **RECOMMENDED** — a recommendation exists, but no one has approved it.
- **APPROVED** — approved by an authorized person. Not used here; no approval has been given.
- **REJECTED** — rejected by an authorized person. Not used here.

## Summary table

| # | Topic | Repository evidence | Options | Recommendation / rationale | Decision owner | Status | Follow-up artifacts / tests |
|---|---|---|---|---|---|---|---|
| 1 | Read path | `AccountRepository.getById` replays the whole stream (`repository.ts:24–34`). No projection exists. Deposit lookup scans the stream (`docs/architecture.md:12`). | A: replay per request. B: projection table. C: projection built from `readAll`. | Use replay for the first release. It matches the existing lookups and needs no new schema. Accept that every page costs a full replay. Plan a projection for Phase 3, with an approved design. | Authorized developer (tech lead) | RECOMMENDED | ADR or decision note; TC-WH01-002, TC-WH01-012; performance note in section 1 |
| 2 | Endpoint paths | Existing routes: `POST /accounts`, `POST /accounts/:id/deposits`, `POST /accounts/:id/withdrawals`, `GET /accounts/:id/deposits/:operationId`, `GET /accounts/:id`, `GET /accounts/:id/events` (`accounts.controller.ts:49–93`). No `support` prefix and no auth guard exist. | A: `/accounts/:id/withdrawals` for customers, `/support/accounts/:id/withdrawals` for support. B: one route with a role parameter. | Keep the separate `/support` prefix so access control can be attached to it. Do not use a role parameter: no auth exists to set the role. | Authorized developer; security reviewer for the guard | RECOMMENDED | Route tests in TC-WH01, TC-WH02, TC-WH03; release gate TC-WH01-022 |
| 3 | Pagination | No pagination in the codebase. `GetAccountEventHistory` returns the full list (`accounts.controller.ts:93–99`). Events are unique per `(stream_id, version)` (`postgres.schema.js:51`). `occurred_on` is not indexed (`postgres.schema.js:45`). | A: offset and limit. B: cursor = last `version`. C: cursor = `occurred_on` plus tie-break. | Use a cursor on `version`. Within one stream, `version` is unique, so no tie-break is needed. Order by `version` and filter by `occurred_on`. | Authorized developer | RECOMMENDED | TC-WH01-011, TC-WH01-012; cursor shape spec |
| 4 | Error codes | `DomainErrorCode` has no `WITHDRAWAL_NOT_FOUND` or `INVALID_DATE_RANGE` (`domain-errors.ts`). `STATUS_BY_CODE` is a `Record` over that union, so the compiler forces a status for each new code (`domain-exception.filter.ts`). `DEPOSIT_NOT_FOUND` maps to 404. | Withdrawal not found: 404 (mirror deposits). Invalid date range: 400 as a `DomainError`, or 400 from DTO validation. | Use 404 for `WITHDRAWAL_NOT_FOUND`. Make `INVALID_DATE_RANGE` a `DomainError` so it gets a stable code. Also see the `INVALID_ID` finding in section 4. | Authorized developer | RECOMMENDED | TC-WH02-004, TC-WH03-003; error-filter unit test |
| 5 | Empty results | `getById` throws `AccountNotFoundError` only when the stream is empty, i.e. version 0 (`repository.ts:29–32`). | A: 200 with `[]` for an existing account. B: 404 when there are no matches. | Return 200 with `[]` for an existing account and for an empty date range. Return 404 only for an unknown account. For the single-operation lookup, keep 404 `WITHDRAWAL_NOT_FOUND` (matches deposits). | Authorized developer; client to confirm UX | RECOMMENDED | TC-WH01-013, TC-WH03-005 |
| 6 | Audit failure | No audit code exists in `src/` or `test/`. Ocoda appends are per stream, so an audit write would be a separate write with no shared transaction. | A: fail closed (no data if audit fails). B: fail open (return data, log the failure). C: async outbox. | Fail closed. Store audit records outside the account stream. The caller identity needed for the audit is BLOCKED on authentication (Q5). | Security reviewer; client compliance for retention; authorized developer | OPEN (direction RECOMMENDED) | TC-WH04-004, TC-WH04-007; audit storage decision |
| 7 | Compatibility | Event names are immutable (`CLAUDE.md`). Amounts are integer minor units (`money.ts`). `MoneyWithdrawnEvent` payload has `accountId`, `amountMinor`, `operationId`, but no timestamp. `getEvents` drops the envelope's `occurredOn`; `getEnvelopes` keeps it (`event-store.d.ts:80, 115`). | Response uses `amountMinor` (integer). Timestamp comes from `occurred_on` via envelopes. Failed attempts would need new events. | Keep the existing events unchanged. Expose `amountMinor` as an integer. Read the timestamp from envelopes, not from `getEvents`. Treat storing failed attempts as a design change needing review. | Authorized developer | RECOMMENDED | TC-REG-006, TC-REG-011; envelope-read test |

## Detailed review

### 1. Read path: replay versus projection

**Repository facts**
- `AccountRepository.getById` loads the entire stream with `getEvents` and replays it (`repository.ts:24–34`).
- `GetDepositDetailsQuery` scans the stream linearly (`docs/architecture.md:12`).
- `docs/architecture.md` lists "no snapshotting" as a known limitation. Replay cost grows with stream length.
- Projections are planned for Phase 3 (`CLAUDE.md`, "Planned"). None exist.

**Options**
- **A. Replay per request.** Benefits: no new schema, read-your-write, matches existing lookups. Risks: cost grows with stream length, and every page reloads the stream.
- **B. Projection table in the same Postgres database.** Benefits: fast, pageable queries. Risks: projections lag behind the events; this adds schema and a rebuild process; the approach needs design approval.
- **C. Projection built from `readAll`.** Benefits: one projector for all accounts. Risks: the most infrastructure; also needs approval.

**Recommendation:** A for the first release, stated as a known limit. The volume is small and the feature has no freshness requirement in the spec. Plan B for Phase 3.

**Compatibility:** No event change in any option. B adds a table, which needs approval because `CLAUDE.md` says not to add a competing store.

### 2. Endpoint paths

**Repository facts**
- Current customer-side routes are under `/accounts` (`accounts.controller.ts:49–93`).
- There is no `/support` prefix and no guard. The ticket paths are proposals (`tickets.md`, section 4).

**Options**
- **A.** `GET /accounts/:id/withdrawals` (customer list) and `GET /support/accounts/:id/withdrawals[/:operationId]` (support). Benefits: a separate prefix can carry its own guard; release gating is visible in the route. Risks: two route families to maintain.
- **B.** One route with a role parameter. Rejected: no authentication exists to establish the role.

**Recommendation:** A. Also consider `GET /accounts/:id/withdrawals/:operationId` for the customer single-item lookup. The spec doesn't currently require it, so it is not in the tickets. This is a gap to raise with the client, not a decision.

**Decision owner:** developer, plus a security reviewer for the `/support` guard.

### 3. Pagination

**Repository facts**
- No pagination exists in the codebase.
- Events are unique per `(stream_id, version)` (`postgres.schema.js:51`). Within one stream, `version` is a total order.
- `occurred_on` is `TIMESTAMPTZ` but has no index (`postgres.schema.js:45`).
- `IEventFilter` supports `fromVersion`, `direction`, `limit`, and `batch`, but has no timestamp predicate (`event-filter.interface.d.ts`).

**Options**
- **A. Offset and limit.** Risk: items shift when a new withdrawal is appended, so pages can repeat or skip items.
- **B. Cursor on `version`.** Within a stream, versions are unique and only grow, so new appends land after the cursor. Pages do not shift.
- **C. Cursor on `occurred_on` plus a tie-break.** Needed only if sorting across streams. Not needed here.

**Recommendation:** B.
- Order newest first by `version`. Filter the date range on `occurred_on`.
- Make the cursor an opaque encoding of the last `version` and bind it to the account ID. A cursor from another account returns 400.
- Concurrent inserts appear before the first page on a newest-first read, and never inside an already-read page.

**Caveats to resolve in implementation**
- If the application clock moves backwards, `occurred_on` may not follow `version`. A date filter could then exclude an item that sits between two pages. Order by `version`, filter by `occurred_on`, and test this case.
- Confirm how `direction` works with `fromVersion` for descending reads before relying on it.
- Replay still loads the full stream for every page, so the cursor reduces response size, not server work.

### 4. Error codes

**Repository facts**
- `DomainErrorCode` contains eight codes and neither proposed code (`domain-errors.ts`).
- `STATUS_BY_CODE` is typed as `Record<DomainErrorCode, HttpStatus>`, so adding a code without a status is a type error (`domain-exception.filter.ts`).
- `DEPOSIT_NOT_FOUND` maps to 404 (`get-deposit-details.query.ts:41–58`).

**Finding: `INVALID_ID` does not match the current behavior on `:id` routes.**
- The filter returns `code: 'INVALID_ID'` only for ocoda's `InvalidId` error (`domain-exception.filter.ts`).
- `:id` routes use `ParseUUIDPipe` (`accounts.controller.ts:60, 71, 88, 95`). Its 400 response has no `code` field.
- The existing malformed-ID tests assert only status 400 (`accounts.http.spec.ts:129–130`).
- `TC-WH01-015` and `TC-WH02-006` expect `code: INVALID_ID`. Against the current routes, that expectation would fail. The test or the route needs to change, and this needs a decision.

**Recommendation**
- `WITHDRAWAL_NOT_FOUND`: 404, a `DomainError` subclass, mirroring `DepositNotFoundError`.
- `INVALID_DATE_RANGE`: 400, a `DomainError` subclass, so it has a stable code. Format errors (not a date) stay with DTO validation.
- Map both only in `DomainExceptionFilter`, as `CLAUDE.md` requires.

### 5. Empty results

**Repository facts**
- `getById` throws `AccountNotFoundError` only when the stream is empty (`repository.ts:29–32`). An account that exists but has no withdrawals is valid.
- The event history endpoint returns an array (`accounts.controller.ts:93–99`).

**Recommendation:** 200 with `[]` for an existing account with no matches, and for an empty date range. 404 only for an unknown account. This is a developer convention; the client should confirm the UX.

### 6. Audit failure

**Repository facts**
- No audit code, table, or test exists.
- Each append is per stream. An audit write outside the account stream would not share a transaction with the read.
- The caller identity needed for an audit record cannot be established: there is no authentication (Q5).

**Options and trade-offs**

| Option | Benefit | Risk |
|---|---|---|
| Fail closed: if audit fails, no data is returned | Every disclosure is recorded | Support is unavailable while the audit store is down |
| Fail open: return data, log the audit failure | Support stays available | Disclosures can go unrecorded |
| Async outbox | Decouples the read from the audit store | More moving parts; the audit can lag behind the disclosure |

**Recommendation:** fail closed, stored outside the account stream. Putting audit records on `account-<id>` would mix support activity into the customer's immutable history, and it changes the event design. This needs a security review and a compliance answer on retention. Until Q5 is answered, the audit cannot record who looked.

**Decision owner:** security reviewer; client compliance for retention; authorized developer for storage.

### 7. Compatibility

- **Event names and payloads.** Unchanged in every option. `CLAUDE.md` forbids renaming events or changing stored payloads. Storing failed attempts adds new event types and needs design review.
- **Timestamps.** The withdrawal payload has no timestamp. The timestamp is `occurredOn` in the envelope. `getEvents` drops it; `getEnvelopes` keeps it (`event-store.d.ts:80, 115`). The read path must use envelopes to return `timestamp`. The current repository uses `getEvents` (`repository.ts:27`), so the read path cannot reuse it unchanged.
- **Amounts.** Expose `amountMinor` as an integer. Do not return decimals; `CLAUDE.md` and `money.ts` require integer minor units.
- **Idempotency.** `withdraw` checks idempotency before funds (`account.aggregate.ts:84–97`). The new read path does not touch this.
- **Regression.** TC-REG-001 to TC-REG-009 must still pass after any change.

## Findings in earlier documents (need correction)

1. **`CLAUDE.md` line 26 is wrong, and the error is mine.** Commit `666f611` changed the validation rule to "`whitelist: true`; unknown properties are stripped, not rejected." The code sets `forbidNonWhitelisted: true` (`app.module.ts:29–35`). The existing tests confirm it: the `extra: true` cases expect 400 (`accounts.http.spec.ts:104–116`). The original wording was correct. I recommend reverting it. I have not changed it, because this step is review-only and the revert is a commit.
2. **`TC-WH01-015` and `TC-WH02-006` expect the wrong code** for malformed IDs on `:id` routes. See section 4.

## Decisions needing a human

| Decision | Who | Why it is not decided here |
|---|---|---|
| Read path: replay or projection | Authorized developer | Architecture choice; projection needs approval |
| Endpoint paths and the `/support` guard | Developer and security reviewer | Authorization is not implemented |
| Cursor shape and descending read behavior | Developer | Must be verified against Ocoda `direction` semantics |
| Error codes and statuses | Developer | Adds public API codes |
| Empty-result convention | Developer; client to confirm UX | API convention with user-facing effect |
| Audit failure behavior | Security reviewer; compliance | Security and reliability trade-off |
| Audit storage location and retention | Security reviewer; client compliance | Event-design and legal implications |
| Revert `CLAUDE.md` line 26 | Repository owner | Corrects a committed doc |
| Malformed-ID error shape | Developer | Tests and routes disagree |

## Files changed in this review

- `docs/feature-kickoff/developer-review.md` (new)

No application code, dependencies, or commits were changed.

## Post-review corrections

Added during the implementation-readiness review. These corrections change facts, not recommendations. Statuses stay RECOMMENDED or OPEN, and nothing here is approved.

1. **Item 3 caveat answered.** `IEventFilter.fromVersion` is a lower bound (`version >= n`) in both `PostgresEventStore.getEnvelopes` and the in-memory store. `direction` only reverses the order. Neither store has an upper bound, a date predicate or an event-type predicate, so older-than-cursor pagination cannot be a native filter. The scan options and their trade-offs are in [engineering-decision-note-scan-and-cursor.md](engineering-decision-note-scan-and-cursor.md).
2. **Items 1 and 3 correction.** A withdrawal history read is a stream scan that can stop early. It is not an aggregate replay, and it needs no balance. The statement that every page costs a full replay applies to paths that call `AccountRepository.getById`, not to a history read built on `getEnvelopes`.
3. **Route references.** The routes span `src/accounts/api/accounts.controller.ts:49–98`. Earlier references to `49–93` cover only part of the file.
