# Spec — Withdrawal History & Visibility

**Status:** DRAFT. Not final.
**Basis:** [updated-open-questions.md](updated-open-questions.md) decision log (rounds 1 and 2), which records **simulated** client decisions from [client-feedback.md](client-feedback.md).
**Note:** All client decisions here are **simulated for the Day 12 training exercise**. They are not real stakeholder approval. Nothing here is production-approved.

## Status meanings

- **Confirmed for demo** — a simulated client decision for the training exercise (round 1 or round 2). Not real client approval.
- **PROVISIONAL** — a default value or policy still needing confirmation. Do not treat as final.
- **OPEN** — a decision is still required before this scope can be finalized or released.
- **BLOCKED** — cannot be implemented or released until the named dependency is resolved.
- **ENG PROPOSAL** — engineering choice for developer review. Not a client decision.

## 1. Goal

Customers and support staff can see what happened to a withdrawal without reading raw event logs.

## 2. Scope

### 2.1 In scope for first release
- Customer withdrawal history. **Confirmed for demo (Q7).**
- Support withdrawal lookup. **Confirmed for demo (Q7).** May ship before customer history once authorization and audit pass. **Confirmed for demo (round 2, Q6.1).**
- Protection of existing routes before any real release. **Confirmed for demo (round 2, item 3).** Mechanism OPEN for security review.

### 2.2 Out of scope for first release
- Failed-attempt history. **Confirmed for demo (Q2, Q7).** Failed attempts are not stored today; showing them would need a design change (see section 9).
- Support actions on withdrawals, such as flagging or reversing. **Confirmed for demo (Q4, Q7).**
- Raw account event history as a customer-facing response. **Confirmed for demo.** The endpoint is kept for internal use only (see section 3).
- Resulting balance on each item. **Confirmed for demo (round 2, D1).**
- Customer lookup of a single withdrawal by `operationId`. **Confirmed for demo (round 2, D3): deferred.**
- Read-model projections, planned as Phase 3 in `CLAUDE.md`.

## 3. Scope boundary: authentication and authorization

**Authentication and authorization are not implemented anywhere in `src/`.** Every existing route is open (`src/accounts/api/accounts.controller.ts`).

- The visibility rules in section 4 are **requirements to be enforced**. They are **not enforced today**.
- **Route protection (round 2, item 3):** all routes, including write routes, must be protected before any real release. The mechanism is OPEN for security review.
- **Raw event history (round 2, item 4):** `GET /accounts/:id/events` is kept for existing functionality but restricted to an authorized internal or security role before release. Tests must verify this access control.
- **Customer release:** BLOCKED until customer authentication and account ownership are defined and implemented (round 1, B1). Ownership relationships are OPEN.
- **Support release:** BLOCKED until support authentication and authorization are implemented and tested (round 1, B2/B3). Support authentication is OPEN for security review and cannot ship without it (round 2, item 3).
- **Internal demos:** test data only, in private or approved environments, with documented sign-off from the designated security reviewer. No production data. Reviewer role and checklist are OPEN until assigned (round 2, item 8).
- Do not describe the visibility rules as "already enforced" in tickets, tests, or release notes.

## 4. Requirements

### 4.1 Existing behavior (must not change)
- A successful withdrawal appends a `money-withdrawn` event to `account-<id>`.
- Insufficient funds throws `InsufficientFundsError` before any event is applied. Nothing is persisted for that attempt.
- A reused `operationId` returns `duplicate` or raises `OPERATION_ID_REUSED`. Neither is stored as a separate record.
- Concurrency conflicts raise `ConcurrencyConflictError` (HTTP 409).
- Event names and payloads are immutable.

### 4.2 Customer history

| Requirement | Status |
|---|---|
| Each item shows: amount, timestamp, `operationId`, `status` | Confirmed for demo (Q1) |
| `status` is always `succeeded` | Confirmed for demo (round 2, Q1.2) |
| Failure reasons are not shown | Confirmed for demo (Q1) |
| Only successful withdrawals are listed | Confirmed for demo (Q2) |
| One entry per `operationId`; retries never shown as separate rows | Confirmed for demo (round 1, D2) |
| Status filter | **Dropped.** Confirmed for demo (round 2, Q1.1). Supersedes the earlier Q3 filter. |
| Date-range filter | Confirmed for demo (Q3). Rules in section 4.7. |
| Sorting: newest first | Confirmed for demo (Q3) |
| Pagination: next/previous navigation, no total count | Confirmed for demo (round 2, P2) |
| Response body is a bare list | Confirmed for demo (round 2, item 2). Cursor mechanism is an ENG PROPOSAL. |
| Customers see only their own accounts | Visibility expectation confirmed for demo (Q5). **BLOCKED: ownership and authentication not implemented (round 1, B1).** |
| Resulting balance | **Excluded.** Confirmed for demo (round 1, D1). |

**Provisional defaults (Q3):**
- Default lookback period: **90 days**, applied only when neither `from` nor `to` is given — PROVISIONAL.
- Default page size: **20 items** — PROVISIONAL.
- Maximum page size: **100**, capped silently — Confirmed for demo (round 2, P2/Q4.1).

### 4.3 Withdrawal status
- Only one status is shown: `succeeded`. — Confirmed for demo (Q2).
- `pending` and `reversed` are **OPEN.** Do not implement until decided.
- Storing failed attempts so they can be shown is **OPEN and BLOCKED on a developer design decision** (see section 9). Failed-withdrawal visibility is a future feature requiring separate design review. Confirmed for demo (round 1, P5).
- Failed attempts are not recorded in the first release. This is stated in documentation and help text, not in API responses. Suggested wording: "Only successful withdrawals appear in history; failed attempts are not recorded." — Confirmed for demo (round 2, Q5); the wording is a suggestion, not final.

### 4.4 Support lookup
- Separate support view from the customer view. — Confirmed for demo (Q4).
- Lookup by account plus `operationId`, or by account plus date range. — Confirmed for demo (Q4).
- Returns the same summarized fields as the customer view. No raw events. — Confirmed for demo (round 1, D4, D6).
- Every lookup requires a **structured case ID**, plus an optional note. No external case-system integration. Format and length limits are an ENG PROPOSAL, OPEN for engineering review. — Confirmed for demo (round 2, Q2.3–Q2.4; round 2, item 5).
- The case ID and note are stored in the audit record, not returned in the response. — Confirmed for demo (round 1, D6).
- No support actions. — Confirmed for demo (Q4, Q7).
- Unknown and unauthorized accounts return the same not-found response. — Confirmed for demo (round 1, P3).
- Cross-account lookup for support staff requires an authorized role. Role tiers are **OPEN** (round 1, B2).
- Support authentication mechanism: **OPEN** for security review (round 2, item 3).

### 4.5 Audit
- Support lookups are audited with: staff ID, account ID, query details, timestamp, case ID and note. — Confirmed for demo (round 1, B4).
- Customer lookups are audited from the first customer endpoint, once per page request, with: customer ID, account ID, query parameters, timestamp and result count. — Confirmed for demo (round 2, Q2.1–Q2.2). This **reverses** the earlier WH-04 proposal that customer lookups are not audited.
- Denied access attempts and rejected support lookups (including a missing or invalid case ID) are audited. — Confirmed for demo (round 2, item 6).
- Audit recording failure **blocks** the read, for both customer and support. — Confirmed for demo (round 2, item 4); subject to security review. Round 1 (B4) recorded a preference to block for support.
- Empty-result auditing is deferred to the audit design review. — OPEN (round 2, item 6).
- **OPEN:** audit storage location, who may read audit records, and the audit retention period (B5, legal/compliance).
- **OPEN:** whether support must see the underlying events. Summary only for now (D4); revisit only with a role design.

### 4.6 Retention
- Retain history for the life of the account; no deletion in the first release. — **PROVISIONAL (Q6).**
- Legal and regulatory retention requirements for transactions and audit records: **OPEN** pending legal/compliance guidance (round 1, B5).
- Deletion, archiving, or anonymization: **OPEN.** Deletion conflicts with immutable events and needs a technical design decision (see section 9).

### 4.7 Dates
- All date handling is in **UTC**. Both bounds are **inclusive**. — Confirmed for demo (round 1, P1).
- `from` only → `to` = now. `to` only → start of history. The 90-day default applies only when both are omitted, as a rolling window. — Confirmed for demo (round 2, Q3.1, Q3.2, Q3.3). The exact edge at day -90 is PROVISIONAL.
- Date-only `from` = UTC midnight of that day. Date-only `to` = the whole UTC day. — Confirmed for demo (round 2, Q3.4).
- Full timestamps must include a timezone. A timestamp without a timezone is rejected. — Confirmed for demo (round 2, item 6).
- Reversed dates (`from` after `to`) and malformed dates are rejected. — Confirmed for demo (round 2, Q3.5–Q3.6).
- Future `to` and future `from` values are rejected. Date-only `to` for today (UTC) is allowed and covers the whole day. — Confirmed for demo (round 2, item 1).
- `from` equal to `to` is valid. — Confirmed for demo (round 2, item 6).
- No maximum range. Performance risk is to be reviewed with engineering. — Confirmed for demo (round 1, P1).
- Clock tolerance for the future-date check: ENG PROPOSAL (round 2, item 1).

### 4.8 Pagination and page size
- Default page size 20. Values above 100 are capped at 100. — Confirmed for demo (round 2, Q4.1).
- Zero, negative, non-integer, and non-numeric values are rejected. — Confirmed for demo (round 2, item 7).
- The cursor mechanism for next/previous is an ENG PROPOSAL.

### 4.9 Empty results
- An account with no matching withdrawals returns a **bare empty list**. The UI shows "No withdrawals found". — Confirmed for demo (round 2, item 1 of the empty-results decision).
- An unknown `operationId` returns 404. — Confirmed for demo (round 1, P3).

### 4.10 Delivery
- Target date is based on completion of the required authentication, authorization and audit decisions. No fixed date. — Confirmed for demo (round 1, D5).
- Review date for OPEN items: **OPEN** until the project lead identifies the stakeholders (round 2, item 5).

## 5. Expected behavior

Error codes marked **(proposed)** are new. They need developer review and are not client-confirmed. The HTTP status and the behavior are client-decided where stated; the error code names are not.

| Case | Expected result | Status |
|---|---|---|
| Account has withdrawals | List returned, newest first, one page | Confirmed for demo; default size PROVISIONAL |
| Account has no withdrawals, or no matches | Bare empty list (200) | Confirmed for demo (round 2) |
| Account does not exist | `404 ACCOUNT_NOT_FOUND` | Existing code; same response as unauthorized account (round 1, P3) |
| `operationId` not found for account | `404` (code `WITHDRAWAL_NOT_FOUND` proposed) | Status confirmed for demo; code ENG PROPOSAL |
| `from` after `to` | `400` (code `INVALID_DATE_RANGE` proposed) | Rejection confirmed for demo; code ENG PROPOSAL |
| Malformed date, timestamp without timezone, future `from` or `to` | `400` | Confirmed for demo (round 2); code ENG PROPOSAL |
| `pageSize` above 100 | Capped at 100 | Confirmed for demo (round 2) |
| `pageSize` zero, negative, non-integer, non-numeric | `400` | Confirmed for demo (round 2); code ENG PROPOSAL |
| Support lookup with missing or invalid case ID | `400`; denied attempt is audited | Confirmed for demo (round 2); code ENG PROPOSAL |
| Audit recording fails | Read blocked | Confirmed for demo (round 2), subject to security review |
| Invalid account ID format | `400 INVALID_ID` | Existing code (see note in `developer-review.md`: the code is not returned on `:id` routes today) |

## 6. Acceptance criteria (draft)

Criteria marked BLOCKED or OPEN are not testable until the dependency is resolved.

- [ ] Customer list shows amount, timestamp, `operationId`, and status only. — Confirmed for demo.
- [ ] Failed attempts and failure reasons do not appear in any response. — Confirmed for demo.
- [ ] Customer list has no status filter. — Confirmed for demo (round 2).
- [ ] Customer list defaults to a 90-day lookback and 20 items per page, when no dates are given. — PROVISIONAL.
- [ ] Customer list is sorted newest first, with next/previous navigation. — Confirmed for demo.
- [ ] Support lookup by account plus `operationId` returns the same fields as the customer view. — Confirmed for demo.
- [ ] Support lookup by account plus date range returns matching withdrawals. — Confirmed for demo.
- [ ] Each support lookup requires a structured case ID and is audited. — Confirmed for demo (round 2).
- [ ] Each customer page request is audited. — Confirmed for demo (round 2); audit design OPEN.
- [ ] Denied access and rejected support lookups are audited. — Confirmed for demo (round 2).
- [ ] Audit failure blocks the read. — Confirmed for demo (round 2), subject to security review.
- [ ] No support action endpoint exists in this release. — Confirmed for demo.
- [ ] Customers can see only their own accounts. — **BLOCKED: ownership and authentication (round 1, B1).** Must not be marked passed against an unauthenticated API.
- [ ] All existing routes require authentication before real release. — **BLOCKED: authentication design (security review).**
- [ ] Raw event history is refused to non-internal roles. — **BLOCKED: authorization design.**
- [ ] Existing withdrawal behavior is unchanged and existing tests still pass. — Existing rule.
- [ ] No new event types or payload changes without design review. — Existing rule.
- [ ] Each new error code is mapped only in `DomainExceptionFilter`. — Existing rule.
- [ ] Money values use integer minor units. — Existing rule.

## 7. Blocked and open decisions

| Item | Status | Blocks | Owner |
|---|---|---|---|
| Customer authentication and account ownership model | BLOCKED (round 1, B1) | Customer-facing release | Client and security review |
| Support authentication mechanism | OPEN (round 2, item 3) | Support release | Security reviewer |
| Support role tiers and who reads audit records | OPEN (round 1, B2) | Support authorization; audit access | Client and security review |
| Route protection mechanism for all existing routes | OPEN (round 2, item 3) | Any real release | Security reviewer and developers |
| Raw event history restricted role | OPEN (round 2, item 4) | Release of `GET /accounts/:id/events` | Security reviewer |
| Audit storage location, fields, and failure handling | OPEN (security review) | WH-04; support release | Security reviewer and developers |
| Audit retention and legal/compliance requirements | OPEN (round 1, B5) | Production use | Client compliance |
| Deletion, archiving, anonymization | OPEN | Retention design | Client and developers |
| Edge inclusivity of the 90-day window (day -90) | PROVISIONAL | Final default | Client |
| Confirm 90-day lookback and page size of 20 | PROVISIONAL | Final defaults | Client |
| Clock tolerance for future-date checks | ENG PROPOSAL | Date validation | Developers |
| Cursor mechanism for next/previous | ENG PROPOSAL | Pagination | Developers |
| Case ID format and length limits | OPEN (engineering review) | Support request validation | Developers |
| Empty-result auditing | OPEN (audit design review) | WH-04 | Security reviewer |
| `pending` and `reversed` statuses | OPEN | Status list | Client |
| Failed-withdrawal visibility | Future feature (round 1, P5) | Separate design review | Client and developers |
| Security reviewer identity, role and demo checklist | OPEN (round 2, item 8) | Demo sign-off | Project lead |
| Review date and stakeholder list | OPEN (round 2, item 5) | Implementation planning | Project lead |
| Delivery date | Dependency-based (round 1, D5) | Schedule | Client |

## 8. Risks

1. Customer or support data could be exposed before authentication and route protection exist. Mitigation: block all real releases (section 3).
2. Audit recording failure blocks reads, so an audit-store outage makes support unavailable. Mitigation: availability plan and security review.
3. Auditing denied attempts can produce high write volume under abuse. Mitigation: rate and volume review in the audit design.
4. Retention rules may be wrong for production. Mitigation: legal confirmation before production use.
5. Failed-attempt visibility, if later required, changes the event-sourcing design. Mitigation: developer review before any change.
6. Every read replays the full stream, and there is no maximum range. Performance is unmeasured. Mitigation: engineering review before implementation planning.

## 9. Design dependencies for developers

- **Failed-attempt storage:** not stored today. If required later, it needs new events and a design review. Event names and payloads for existing events must not change.
- **Deletion vs. immutable events:** deletion requirements conflict with the current event store. Needs a technical design decision before any retention rule is implemented.
- **Read path:** replay of the stream (current `GetAccountState` approach) or a projection is a developer decision. Replay is the current code path (`src/accounts/infrastructure/account.repository.ts`).
- **Timestamp source:** the withdrawal timestamp must come from the stored event envelope (`occurredOn`), not the payload. `AccountRepository.getById` uses `getEvents`, which does not return it.
- **Cursor for next/previous:** a bare-list response needs a cursor carried in a header or another mechanism. Verify Ocoda `direction` and `fromVersion` behavior on descending reads before relying on it.
- **Route protection:** adding a guard changes the existing HTTP tests, which currently call routes without credentials.

## 10. Next steps

1. Security reviewer designs customer and support authentication, authorization, route protection, and audit (sections 3, 4.5, 7).
2. Project lead identifies the security reviewer and stakeholders, then sets the review date.
3. Developers resolve the ENG PROPOSAL and OPEN engineering items (section 7, section 9).
4. Client confirms the PROVISIONAL defaults and remaining OPEN product items.
5. After these are resolved, update `tickets.md` and `test-matrix.md`. Do not create implementation tickets for BLOCKED or OPEN items.
