# Day 12 — Completion summary: Withdrawal History & Visibility

**Status:** Work is uncommitted on branch `feat/new-feature-withdrawal-kickoff`. Client decisions are **simulated** for the training exercise and are not real approvals.

## Accomplishments

- **Test-count discrepancy resolved.** The baseline (79 unit tests, 9 e2e) matches the tree before commit `87ca257`, which added one unit test and one e2e test. No test was removed or changed to fit the count.
- **Date-range resolver built** (`src/shared/date-range.ts`, G1). It takes an injected `now` and required `clockToleranceMs` and `defaultLookbackDays`, and returns a result union with failure reasons. It chooses no error codes or HTTP statuses.
- **Page-size parser built** (`src/shared/page-params.ts`, G1). Default and maximum are caller-supplied. Values above the maximum are capped; zero, negative, non-integer and non-numeric values are rejected.
- **Scan and cursor decision documented** (`docs/feature-kickoff/engineering-decision-note-scan-and-cursor.md`). Option B is implemented for the internal handler: a full forward read, with filtering and paging in memory. It is RECOMMENDED, not approved as the production strategy.
- **Internal withdrawal-history handler built** (`src/accounts/application/queries/get-withdrawal-history.query.ts`). It is unexposed. It filters `money-withdrawn` envelopes by `metadata.occurredOn`, sorts newest first, and pages with an internal `beforeVersion` position, not an API cursor.
- **Simulated decisions preserved.** Every decision is labelled, and every unresolved item stays OPEN in the feature-kickoff docs.

## Verification (Node 24.22.0, actual results)

| Check | Result |
|---|---|
| Focused tests (3 spec files) | pass, 85 tests (74 from G1, 11 new) |
| Full unit suite | pass, 165 tests in 7 files (80 existing + 85 new) |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0 |
| Prettier check, six new files | exit 0 |

Prettier was applied only to the new files. No end-to-end (`test:e2e`) run, since no persistence code changed.

## Remaining blockers

- **Product and API:** the response field name (`amount` or `amountMinor`), error codes and statuses, the case-ID format and location, and the cursor transport.
- **Security:** customer and support authentication, account ownership, route protection, and the role that can read raw events.
- **Audit:** storage, schema, readers, fail-closed behaviour, and denied-attempt capture.
- **Client:** retention and legal guidance, the 90-day edge, and the review date.
- **Wiring:** the handler cannot be exposed until the API contract and security design are approved.

## Defects found and not yet fixed

- **Sub-millisecond `to` truncation.** A `to` such as `…00.123999Z` is truncated to `.123`, so an event at `.123456` is excluded even though the bound is meant to be inclusive. This is a functional defect. Decide whether to reject sub-millisecond input or document and test the truncation.
- **Misleading `reversed` error.** When `from` is within clock tolerance and `to` defaults to now, the result is `reversed`. This is a UX issue. Pin the intended behaviour with a test.
- **`+5` accepted as a page size.** Through a query string, `+` usually decodes to a space, so this input is probably unreachable. The plain-digits rule is the likely fix.

## Recommended Day 13 priorities

1. Decide the parser semantics: sub-millisecond handling, `+` signs, lowercase `z`, and empty strings. Add the matching tests.
2. Decide the API contract: field name, error codes, and cursor transport.
3. Design authentication, ownership and route protection with the security reviewer. Nothing customer-facing ships before this.
4. Design audit: storage, readers and fail-closed behaviour.
5. Measure the full-stream read on a seeded account, to justify or reject a projection.
6. When authentication lands, update the existing HTTP tests so they authenticate.
7. Review and commit the Day 12 work. Switch to Node 24 with `nvm use` before running tests; the default shell is Node 18.
