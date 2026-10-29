# Engineering decision note — withdrawal history scan strategy and cursor

**Status:** RECOMMENDED. **Not approved.** Decision owner: an authorized developer. No code, test or dependency change depends on this note until it is approved (gate G2 in the plan).
**Inputs:** [spec.md](spec.md), [tickets.md](tickets.md) (WH-01, WH-03), [developer-review.md](developer-review.md) items 1 and 3, the readiness review.
**Client context:** the paging rules (next/previous, default 20, cap 100, bare-list body) and date rules are **simulated** client decisions for the training exercise. They are not approved production requirements. This note decides none of them.

## 1. Verified facts

All paths are from this repository. Verified by reading source, not by running tests.

- **`fromVersion` is a lower bound only.** `PostgresEventStore.getEnvelopes` (`node_modules/@ocoda/event-sourcing-postgres/dist/postgres.event-store.js`, around line 205) adds `AND version >= $2` when `fromVersion` is set. The in-memory store (`node_modules/@ocoda/event-sourcing/dist/integration/event-store/in-memory.event-store.js`, around line 67) filters `version >= fromVersion` the same way.
- **`direction` only changes the sort order.** Postgres uses `ORDER BY version ASC|DESC`. The in-memory store reverses the sorted array. Neither store adds an upper bound.
- **No other filters.** `IEventFilter` (`node_modules/@ocoda/event-sourcing/dist/interfaces/events/event-filter.interface.d.ts`) has `fromVersion`, `pool`, `direction`, `limit` and `batch`. There is no date, event-type or upper-version predicate.
- **`limit` counts all events in the stream**, not withdrawals. `limit || Number.MAX_SAFE_INTEGER`, applied before the event-type filter, so a page cannot be built from `limit` alone.
- **Reads are batched and can stop early.** `readInBatches` yields batches of `batch` rows (default 100). The generator closes when the consumer stops, and the Postgres code says so in a comment near the `catch`.
- **Timestamps come from envelopes.** `occurredOn` is derived from `eventId.date` when the store drafts the envelope (`node_modules/@ocoda/event-sourcing/dist/event-store.js`, around line 169). `getEnvelopes` returns it. How `eventId.date` itself is generated has **not been verified** and is not assumed here. `getEvents` drops it, and `AccountRepository.getById` uses `getEvents` (`src/accounts/infrastructure/account.repository.ts:27`).
- **`occurred_on` is not indexed.** The column is `TIMESTAMPTZ NOT NULL` (`postgres.schema.js:45`). The indexes that exist are on `global_position` and `(aggregate_name, latest)`.
- **Idempotency gives one withdrawal per `operationId`.** `Account.withdraw` returns `'duplicate'` before emitting, so a history read finds at most one `money-withdrawn` per key. Deposit events share the same stream and must be filtered out by event type.
- **Current account reads replay everything.** `AccountRepository.getById` loads the whole stream and replays it (`repository.ts:24–34`).

## 2. Limitation to design around

`fromVersion` cannot express "versions older than the cursor". A newest-first page must read backward from the head (or from a known upper bound) and skip versions above the cursor in application code. The store provides no native upper bound. Any design that assumes otherwise is wrong.

## 3. Scan options

| Option | How it works | Benefit | Cost and risk |
|---|---|---|---|
| **A. Backward read from head, stop when the page is full** | `getEnvelopes` with `direction: BACKWARD`, no `fromVersion`. Skip versions at or above the cursor. Stop the generator once the page is full. | Simple. No schema change. Stops early for the first pages. | Deep pages read every event newer than the cursor. Cost depends on how many events are newer than the cursor, not on the account's total length. Deposits are skipped in code, so pages may need extra reads. |
| **B. Read the whole stream and reverse in memory** | Forward read, collect withdrawals, sort in memory. | Simplest code. Easy to test. | Reads the whole stream on every page, with no early stop. Same cost class as the current replay. |
| **C. Projection table** | A separate read model, built from events, indexed by account and date. | Fast, pageable, indexed. | New schema and a rebuild process. `CLAUDE.md` says a new event store or dependency needs approval, and this is Phase 3. Projections may lag. |
| **D. Forward read from the cursor** | `fromVersion = cursor + 1`, forward. | Natural for "newer than" paging (previous page). | Does not serve "older than" (next page) by itself. Usable only as a half of A. |

**Recommendation (RECOMMENDED, not approved):** A for the first increment, with B's test coverage used as a correctness oracle. Plan C for Phase 3. Use D only as the "previous page" path if A is accepted.

**Implemented for the internal handler (Day 12 increment, still not approved as the production strategy):** option **B**. `GetWithdrawalHistoryHandler` reads the whole stream forward with `getEnvelopes`, keeps `money-withdrawn` envelopes whose `metadata.occurredOn` falls in the resolved range, sorts by version, and pages in memory. Why B over A for this increment: it needs no backward read and no early stop, so it relies on no `direction` or `fromVersion` behaviour beyond the default forward read. Its cost matches the current replay, which is simpler to reason about than A's partial reads. The trade-off is that every page reads the whole stream, and that cost has not been measured. Paging uses an internal `beforeVersion` position, not the API cursor. Cursor encoding and transport remain OPEN.

**Known trade-off:** with A, the first page is cheap, but deep pages cost more. For a learning project with small streams this is acceptable. It is not a production performance claim, and the cost has not been measured.

## 4. Cursor options

| Option | Notes |
|---|---|
| **Version-based cursor (RECOMMENDED)** | Opaque encoding of the version of the last returned item. Versions are unique within a stream, so there is no tie-break. Bind the cursor to the account: a cursor for account X is rejected on account Y. |
| Timestamp-based cursor | Needs a tie-break and depends on `occurred_on` ordering. The clock-regression case in section 5 breaks it. Not recommended. |
| Offset | Rejected by the readiness review: pages shift when a withdrawal is appended. |

**Transport is OPEN.** The response body must stay a bare list (client round 2, 2c item 2). The cursor therefore has to travel in a response header or a similar channel. The choice is an engineering decision for the developers. Do not add a body wrapper without a new client decision.

Next and previous:
- **Next** = older page: use option A with the cursor.
- **Previous** = newer page: use option D with the cursor.

## 5. Date filter interaction

- Order by `version` (the stream order). Apply the date range as a filter on `occurredOn`, not as the ordering key.
- **Clock regression:** if the application clock moves backward, `occurredOn` may not follow `version`. A date filter could then skip an item between two pages. Tests must cover this case.
- **No early stop on date alone.** The scan cannot stop when an older event is outside the range, because later versions may still be in range if the clock regressed. The stop rule therefore needs a decision: stop on a version boundary, or stop only when the page is full. **OPEN.**

## 6. Proposed codes and statuses (PROPOSED, not approved)

| Case | Proposed HTTP status | Proposed code | Status of each part |
|---|---|---|---|
| Account not found | 404 | `ACCOUNT_NOT_FOUND` (existing) | Existing |
| Withdrawal `operationId` not found for the account | 404 | `WITHDRAWAL_NOT_FOUND` (name ENG PROPOSAL) | 404 is a simulated client decision (2b item 1 / P3). The name is an engineering proposal. |
| `from` after `to` | 400 | name **OPEN** | 400 rejection is a simulated decision. The name is OPEN. |
| Malformed date, timestamp without timezone, future `from` or `to` | 400 | name **OPEN** | Rejection is a simulated decision (2b item 6, 2c item 1). Names OPEN. |
| Page size zero, negative, non-integer, non-numeric | 400 | name **OPEN** | Rejection is a simulated decision (2b item 7). Name OPEN. |
| Page size above 100 | 200, capped at 100 | none | Simulated decision (2b item 7). |
| Missing or invalid case ID | 400 | name **OPEN** | Rejection is a simulated decision (2b item 5). Name and format OPEN. |
| Malformed account ID on `:id` routes | 400, no `code` today | **OPEN** | Current behavior verified. Whether a code is returned is OPEN (see `developer-review.md` section 4). |

Mapping rules (existing, not changed by this note): `DomainErrorCode` is a closed union, and `STATUS_BY_CODE` is `Record<DomainErrorCode, HttpStatus>` in `src/shared/domain-exception.filter.ts`. Adding a code forces a mapping. Codes are mapped only in `DomainExceptionFilter` (`CLAUDE.md`). The filter has no mapping for `ParseUUIDPipe` errors today.

## 7. Not decided here

- Scan strategy (option A, B, C or D). **RECOMMENDED only.**
- Cursor shape and transport. **OPEN.**
- Stop rule for date filtering with clock regression. **OPEN.**
- Error code names and statuses in section 6. **OPEN.**
- Response field name `amount` vs `amountMinor`. **OPEN.** Internal records in the increments may use payload names, which does not decide the API field name.
- Clock tolerance for future-date checks. **OPEN.**
- 90-day edge inclusivity. **OPEN** (client). Not assumed.
- Projection timing (option C). **OPEN** and needs approval.
- Empty-result auditing. **OPEN** (2c item 6).

## 8. Approval needed

- An authorized developer approves or rejects the scan strategy and the cursor shape (gate G2).
- An authorized developer approves the code and status names (gate G3).
- No client decision is needed for this note itself, but the OPEN client items in section 7 remain open.
