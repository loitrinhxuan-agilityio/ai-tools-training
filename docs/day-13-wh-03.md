# Day 13 — WH-03 (Issue #11): internal support lookup by account and date range

**Status:** internal handler only. Not registered, no route, not released.
**Base:** `origin/main` at `aa9d272` (WH-01 and WH-02 merged).

## Built

- `ListSupportWithdrawalsHandler` (`src/accounts/application/queries/list-support-withdrawals.query.ts`). It validates the raw `from`, `to` and `pageSize` before any store read, then delegates to the existing `GetWithdrawalHistoryHandler`. No scan logic is duplicated.
- Four input error types in `src/shared/domain-errors.ts` (`INVALID_DATE_RANGE`, `INVALID_DATE`, `FUTURE_DATE`, `INVALID_PAGE_SIZE`), each mapped to 400 in `DomainExceptionFilter`.
- Unit spec: `list-support-withdrawals.query.spec.ts` (27 tests). Covers TC-WH03-001 to 007, with boundary, offset, clock-regression, page-size and empty-result cases, a date-only `from` at UTC midnight, and clock-tolerance wiring.

## Not built (blocked)

- Route, controller, DTO, case ID and note: WH-04 and support authentication.
- Cross-account authorization (TC-WH03-008): BLOCKED on round 1 B2.
- Audit record (TC-WH03-009) and missing-case-ID audit (TC-WH03-010): BLOCKED on WH-04.

## Decisions taken

- **G3 approved:** error codes `INVALID_DATE_RANGE`, `INVALID_DATE`, `FUTURE_DATE`, `INVALID_PAGE_SIZE`, all 400, as proposed. Applies to the internal handler only; route-level behaviour is not covered.
- **G2 approved for this increment only:** full forward stream read (option B). Not approved as the production read strategy. Cost is unmeasured, and the Phase 3 projection remains open.
- The 90-day lookback (PROVISIONAL), default page size 20 (PROVISIONAL) and cap 100 are injected by the caller. The clock tolerance is required and has no default (OPEN).
- The scan is the full forward read from WH-01, with no scan cap. Cost is unmeasured.

## Verification

- `npm test`: 216 passed (9 files), including the 27 WH-03 spec tests.
- `npm run typecheck`, `npm run build`, `npm run lint` (`oxlint --type-aware`): all exit 0.
- `npm run test:e2e` not run: no persistence or serialization change.
- Not verified: the response contract, the route, and any behaviour under a real Postgres store.
