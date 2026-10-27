# Spec — Withdrawal History & Visibility

**Status:** DRAFT. Not final.
**Basis:** [updated-open-questions.md](updated-open-questions.md) decision log, which records simulated client feedback from [client-feedback.md](client-feedback.md).
**Note:** The client feedback is **assumed for the Day 12 training simulation**. It is not real client approval. Nothing here is production-approved.

## Status meanings

- **Confirmed for demo** — agreed for this training exercise. Not real client approval.
- **PROVISIONAL** — a default value or policy still needing confirmation. Do not treat as final.
- **OPEN** — a decision is still required before this scope can be finalized or released.
- **BLOCKED** — cannot be implemented or released until the named dependency is resolved.

## 1. Goal

Customers and support staff can see what happened to a withdrawal without reading raw event logs.

## 2. Scope

### 2.1 In scope for first release
- Customer withdrawal history. **Confirmed for demo (Q7).**
- Support withdrawal lookup. **Confirmed for demo (Q7).**

### 2.2 Out of scope for first release
- Failed-attempt history. **Confirmed for demo (Q2, Q7).** Failed attempts are not stored today; showing them would require a design change (see section 9).
- Support actions on withdrawals, such as flagging or reversing. **Confirmed for demo (Q4, Q7).**
- Raw account event history as a customer-facing response. Explicitly excluded in the decision log.
- Read-model projections, planned as Phase 3 in `CLAUDE.md`.

## 3. Scope boundary: authentication and authorization

**Authentication and authorization are out of scope for this feature and are not implemented in the codebase.**

- The visibility rules in section 4 (customers see only their own accounts; support sees across accounts) are **requirements to be enforced**. They are **not enforced today**.
- A customer-facing release is **BLOCKED** until an access-control approach is agreed and implemented (Q5). This is the release dependency stated in the client feedback.
- Until then, these endpoints must not be exposed to real customers or real support staff. Do not describe the rules as "already enforced" in tickets, tests, or release notes.

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
| Each item shows: amount, timestamp, `operationId`, status | Confirmed for demo (Q1) |
| Failure reasons are not shown | Confirmed for demo (Q1) |
| Only successful withdrawals are listed | Confirmed for demo (Q2) |
| Filters: date range and status | Confirmed for demo (Q3) |
| Sorting: newest first | Confirmed for demo (Q3) |
| Pagination | Confirmed for demo (Q3) |
| Customers see only their own accounts | Confirmed for demo as a visibility expectation (Q5); **BLOCKED: access control not implemented** |
| Resulting balance is displayed | **OPEN.** Not in the confirmed field list. Do not implement until decided. |

**Provisional defaults (Q3):**
- Default lookback period: **90 days** — PROVISIONAL.
- Default page size: **20 items** — PROVISIONAL.
- Maximum page size: **not defined by the client.** Any cap is an engineering proposal and needs confirmation.

### 4.3 Withdrawal status
- Only one status is shown in the first release: `succeeded`. — Confirmed for demo (Q2).
- `pending` and `reversed` are **OPEN.** The decision log asks whether they are needed and does not answer it. Do not implement them until decided.
- Storing failed attempts so they can be shown is **OPEN and BLOCKED on a developer design decision** (see section 9).

### 4.4 Support lookup
- Separate support view from the customer view. — Confirmed for demo (Q4).
- Lookup by account plus `operationId`. — Confirmed for demo (Q4).
- Lookup by account plus date range. — Confirmed for demo (Q4).
- Support sees the customer fields above, not raw events. — Derived from the exclusion of raw event history; confirm with client.
- No support actions. — Confirmed for demo (Q4, Q7).
- Support lookups are audited. — Confirmed for demo (Q4).
- **OPEN:** the minimum audit fields and who can read audit records. Not decided.
- **OPEN:** whether support must see the underlying events. Not decided.
- Cross-account lookup for support staff. — Confirmed for demo visibility expectation (Q5); **BLOCKED: access control not implemented.**

### 4.5 Retention
- Retain history for the life of the account; no deletion in the first release. — **PROVISIONAL (Q6).**
- Legal and regulatory retention requirements are **OPEN.** Not verified. Must be confirmed before production use.
- Deletion, archiving, or anonymization: **OPEN.** Deletion conflicts with immutable events and needs a technical design decision (see section 9).

### 4.6 Delivery
- No delivery deadline has been set. — **OPEN (Q7).**

## 5. Expected behavior

Error codes marked **(proposed)** are new. They need developer review and are not client-confirmed.

| Case | Expected result | Status |
|---|---|---|
| Account has withdrawals | List returned, newest first, one page | Confirmed for demo (behavior); defaults PROVISIONAL |
| Account has no withdrawals | Empty list, not an error | Engineering proposal |
| Account does not exist | `404 ACCOUNT_NOT_FOUND` | Existing code |
| `operationId` not found for account | `404 WITHDRAWAL_NOT_FOUND` (proposed) | Engineering proposal |
| `from` date after `to` date | `400 INVALID_DATE_RANGE` (proposed) | Engineering proposal |
| Page size above maximum | Capped at maximum | Maximum OPEN |
| Invalid account ID format | `400 INVALID_ID` | Existing code |

## 6. Acceptance criteria (draft)

Criteria marked BLOCKED or OPEN are not testable until the dependency is resolved.

- [ ] Customer list shows amount, timestamp, `operationId`, and status only. — Confirmed for demo.
- [ ] Failed attempts and failure reasons do not appear in any response. — Confirmed for demo.
- [ ] Customer list defaults to a 90-day lookback and 20 items per page. — PROVISIONAL.
- [ ] Customer list is sorted newest first and supports date-range and status filters. — Confirmed for demo.
- [ ] Support lookup by account plus `operationId` returns the same fields as the customer view. — Confirmed for demo; field set to be confirmed.
- [ ] Support lookup by account plus date range returns matching withdrawals. — Confirmed for demo.
- [ ] Each support lookup is audited. — Confirmed for demo; audit fields OPEN.
- [ ] No support action endpoint exists in this release. — Confirmed for demo.
- [ ] Customers can see only their own accounts. — **BLOCKED: access control (Q5).** Must not be marked passed by testing against an unauthenticated API.
- [ ] Customer-facing endpoints are not exposed to real users. — **BLOCKED: access control (Q5).**
- [ ] Existing withdrawal behavior is unchanged and existing tests still pass. — Existing rule.
- [ ] No new event types or payload changes without design review. — Existing rule.
- [ ] Each new error code is mapped only in `DomainExceptionFilter`. — Existing rule.
- [ ] Money values use integer minor units. — Existing rule.

## 7. Blocked and open decisions

| Item | Status | Blocks | Owner |
|---|---|---|---|
| Access-control approach (customer and support) | BLOCKED | Customer-facing release | Client and security review |
| Confirm 90-day lookback default | PROVISIONAL | Final defaults | Client |
| Confirm page size of 20 | PROVISIONAL | Final defaults | Client |
| Maximum page size | OPEN | Pagination limits | Client and engineering |
| Legal and regulatory retention | OPEN | Production use | Client compliance |
| Deletion, archiving, anonymization | OPEN | Retention design | Client and developers |
| Resulting balance display | OPEN | Field list | Client |
| `pending` and `reversed` statuses | OPEN | Status list | Client |
| Minimum audit fields and audit access | OPEN | Audit requirement | Client and security |
| Support view of underlying events | OPEN | Support view design | Client |
| First-release delivery deadline | OPEN | Schedule | Client |

## 8. Risks

1. Customer data could be exposed before access control exists. Mitigation: block the customer-facing release (section 3).
2. Retention rules may be wrong for production. Mitigation: legal confirmation before production use.
3. Failed-attempt visibility, if later required, changes the event-sourcing design. Mitigation: developer review before any change.

## 9. Design dependencies for developers

- **Failed-attempt storage:** not stored today. If required later, it needs new events and a design review. Event names and payloads for existing events must not change.
- **Deletion vs. immutable events:** deletion requirements conflict with the current event store. Needs a technical design decision before any retention rule is implemented.
- **Read path:** whether history is built by replaying the stream (current `GetAccountState` approach) or by a projection is a developer decision.

## 10. Next steps

1. Client to confirm the PROVISIONAL defaults and the OPEN items in section 7.
2. Resolve the access-control approach before any customer-facing release.
3. After the decisions above are resolved, update this spec and derive `tickets.md` and `test-matrix.md`. Do not create implementation tickets for BLOCKED or OPEN items.
