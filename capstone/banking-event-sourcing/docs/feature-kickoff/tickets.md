# Tickets — Withdrawal History & Visibility

**Status:** DRAFT for developer review. Not final.
**Basis:** [spec.md](spec.md), [client-feedback.md](client-feedback.md), [open-questions.md](open-questions.md)
**Note:** Client decisions come from simulated feedback for the Day 12 training simulation. They are not real client approval.

## Scope rule for this draft

Only **Confirmed for demo** requirements are ticketed. Everything marked PROVISIONAL, OPEN, or BLOCKED is listed in section 3 and is **not** ticketed. No client decision has been invented or silently resolved.

## Labels

- **Confirmed for demo** — agreed for the training exercise; not real client approval.
- **PROVISIONAL** — default value kept as provided; needs client confirmation.
- **OPEN** — decision still required.
- **BLOCKED** — cannot be released until the named dependency is resolved.
- **ENG PROPOSAL** — engineering suggestion for developer review; not a client decision.

## 1. Tickets

### WH-01 — Customer withdrawal history: list endpoint

**Goal:** A customer can list their own successful withdrawals for one account.

**Scope:**
- New read endpoint for one account's withdrawal history. **ENG PROPOSAL:** `GET /accounts/:id/withdrawals`.
- Response fields: amount (minor units), timestamp, `operationId`, status. — Confirmed for demo (Q1).
- Only successful withdrawals are returned. — Confirmed for demo (Q2).
- Filters: date range and status. — Confirmed for demo (Q3).
- Sorted newest first. — Confirmed for demo (Q3).
- Pagination. — Confirmed for demo (Q3). **ENG PROPOSAL:** cursor-based, to avoid offset drift. Developers to decide.
- Default lookback 90 days — **PROVISIONAL (Q3).**
- Default page size 20 — **PROVISIONAL (Q3).**
- Maximum page size — **OPEN.** Do not set a cap until the client decides. Developers must not treat any value as final.

**Out of scope:**
- Failed attempts and failure reasons. — Confirmed for demo (Q1, Q2).
- Resulting balance field. — **OPEN.** Not in the confirmed field list.
- Raw account event history as a response. — Excluded by the decision log.
- `pending` and `reversed` statuses. — **OPEN.**

**Dependencies:**
- **OPEN (developer decision):** read path — replay of `account-<id>` (current `GetAccountState` approach) or a projection. Phase 3 in `CLAUDE.md`.
- **BLOCKED (Q5):** the endpoint must not be exposed to real customers until access control is implemented. Building and testing it is allowed. Releasing it is not.

**Acceptance criteria:**
- [ ] Response contains only `amount`, `timestamp`, `operationId`, and `status` per item. — Confirmed for demo.
- [ ] A withdrawal rejected for insufficient funds never appears in the response. — Confirmed for demo; matches the existing rule that nothing is persisted for it.
- [ ] Items are sorted newest first. — Confirmed for demo.
- [ ] `from` / `to` date-range filter returns only items in range. — Confirmed for demo.
- [ ] `status` filter returns only items with that status. — Confirmed for demo.
- [ ] With no filter, the default lookback is 90 days. — PROVISIONAL.
- [ ] With no page size, 20 items are returned per page. — PROVISIONAL.
- [ ] An account with no withdrawals returns an empty list, not an error. — **ENG PROPOSAL.**
- [ ] An unknown account returns `404 ACCOUNT_NOT_FOUND`. — Existing code.
- [ ] A malformed account ID returns `400 INVALID_ID`. — Existing code.
- [ ] No response includes a failure reason. — Confirmed for demo.
- [ ] No response includes raw event payloads. — Confirmed for demo.
- [ ] Customer-facing release: **BLOCKED (Q5)** until access control is implemented and tested.

**Release status:** Build allowed. Release **BLOCKED (Q5)**.

---

### WH-02 — Support lookup: by account and `operationId`

**Goal:** A support staff member can find one withdrawal and see its outcome.

**Scope:**
- Separate support endpoint, not the customer endpoint. **ENG PROPOSAL:** `GET /support/accounts/:id/withdrawals/:operationId`.
- Response fields: same as WH-01. — Confirmed for demo (Q4).
- Returns the summarized view, not raw events. — Confirmed for demo (Q4). The exact field list for support is **OPEN** (see section 3).
- Each lookup is audited. — Confirmed for demo (Q4). Audit fields are **OPEN**; see WH-04.
- No action endpoints. — Confirmed for demo (Q4, Q7).

**Out of scope:**
- Support actions such as flagging or reversing. — Confirmed for demo (Q4, Q7) as excluded.
- Visibility of underlying events to support. — **OPEN.**

**Dependencies:**
- WH-04 (audit) must be defined before this ticket is released.
- **BLOCKED (Q5):** cross-account support lookup depends on access control. Building it is allowed; release is not.
- **OPEN (developer decision):** read path (same as WH-01).

**Acceptance criteria:**
- [ ] Lookup by account and `operationId` returns the matching withdrawal with the WH-01 field set. — Confirmed for demo.
- [ ] A reused `operationId` for a different account is not returned. — **ENG PROPOSAL.** Lookup is scoped to the account.
- [ ] An `operationId` with no successful withdrawal on that account returns `404 WITHDRAWAL_NOT_FOUND`. — **ENG PROPOSAL.** Error code is new.
- [ ] Unknown account returns `404 ACCOUNT_NOT_FOUND`. — Existing code.
- [ ] Failed attempts are not returned. — Confirmed for demo (Q2).
- [ ] No response includes raw event payloads. — Confirmed for demo (Q4).
- [ ] Support lookup is not a path to any action. No action endpoint is registered. — Confirmed for demo.
- [ ] Cross-account access is **BLOCKED (Q5)** until access control exists.

**Release status:** Build allowed. Release **BLOCKED (Q5)** and **BLOCKED on WH-04**.

---

### WH-03 — Support lookup: by account and date range

**Goal:** A support staff member can list one account's withdrawals within a date range.

**Scope:**
- Support endpoint. **ENG PROPOSAL:** `GET /support/accounts/:id/withdrawals?from=&to=`.
- Same response fields and pagination as WH-01. Pagination defaults are **PROVISIONAL** as in WH-01; the maximum page size is **OPEN**.
- Date range validation: `from` after `to` returns `400 INVALID_DATE_RANGE`. **ENG PROPOSAL.**
- Audited, as in WH-02.

**Dependencies:**
- WH-04 (audit).
- **BLOCKED (Q5)** for cross-account use.
- **OPEN (developer decision):** read path.

**Acceptance criteria:**
- [ ] Only withdrawals with `from <= timestamp <= to` are returned. — Confirmed for demo (Q4).
- [ ] `from` after `to` returns `400 INVALID_DATE_RANGE`. — **ENG PROPOSAL.**
- [ ] Default lookback applies only when `from` / `to` are absent. — **PROVISIONAL (Q3).**
- [ ] Failed attempts are not returned. — Confirmed for demo (Q2).
- [ ] Each lookup is audited. — Confirmed for demo (Q4).
- [ ] Cross-account access is **BLOCKED (Q5)**.

**Release status:** Build allowed. Release **BLOCKED (Q5)** and **BLOCKED on WH-04**.

---

### WH-04 — Audit support lookups

**Goal:** Every support lookup of withdrawal data is recorded.

**Scope:**
- Record each support lookup: who searched, which account, which query, and when. **ENG PROPOSAL** for the minimum set; the audit fields themselves are **OPEN** (see section 3).
- Audit records are written before the response is returned. **ENG PROPOSAL.**
- Storage for audit records is **OPEN**. Do not add a new event type to the account stream for audit without design review.

**Dependencies:**
- **OPEN:** minimum audit fields and who may read audit records.
- **OPEN:** storage location. Developers must not choose it silently; it changes the event-sourcing design if placed on the account stream.
- **BLOCKED (Q5):** the caller identity ("who") cannot be captured reliably until authentication exists.

**Acceptance criteria:**
- [ ] Every support lookup in WH-02 and WH-03 produces an audit record. — Confirmed for demo (Q4).
- [ ] Audit records are not created for customer lookups in WH-01. — **ENG PROPOSAL.** Confirm with client.
- [ ] Audit record fields match the agreed minimum set. — **OPEN.** Not testable until decided.
- [ ] A failed audit write fails the lookup. — **ENG PROPOSAL.** Confirm with security review.

**Release status:** **OPEN.** Do not implement until audit fields, storage, and the caller-identity dependency are decided. Not released.

---

## 2. Cross-cutting engineering rules

These apply to every ticket above. They come from the existing `CLAUDE.md`, not from client decisions.

- Errors are mapped only in `DomainExceptionFilter`.
- Money values are integer minor units.
- No change to existing event names or payloads.
- No new event type without design review.
- Unit tests live next to the code (`*.spec.ts`); HTTP tests use the in-memory store; PostgreSQL behavior is covered by `npm run test:e2e`.

## 3. Not ticketed (PROVISIONAL, OPEN, or BLOCKED)

These items are intentionally not ticketed. Do not create tickets for them until the decision is recorded.

| Item | Label | Blocks | Owner |
|---|---|---|---|
| Access control for customer and support views | BLOCKED (Q5) | Customer-facing release; cross-account support lookup | Client and security review |
| Confirm 90-day lookback default | PROVISIONAL (Q3) | Final default | Client |
| Confirm page size of 20 | PROVISIONAL (Q3) | Final default | Client |
| Maximum page size | OPEN (Q3) | Pagination cap | Client and engineering |
| Legal and regulatory retention | OPEN (Q6) | Production use | Client compliance |
| Deletion, archiving, anonymization | OPEN (Q6) | Retention design | Client and developers |
| Resulting balance display | OPEN (Q1) | Response field list | Client |
| `pending` and `reversed` statuses | OPEN (Q2) | Status list | Client |
| Minimum audit fields and audit access | OPEN (Q4) | WH-04 | Client and security |
| Audit storage location | OPEN | WH-04 | Developers |
| Support view of underlying events | OPEN (Q4) | Support field list | Client |
| Read path: replay or projection | OPEN (developer) | WH-01, WH-02, WH-03 | Developers |
| Failed-attempt storage | BLOCKED (design) | Any failed-attempt visibility | Developers and client |
| Delivery deadline | OPEN (Q7) | Schedule | Client |

## 4. Engineering proposals for developer review

These are not client decisions. Each needs developer review before implementation.

1. Endpoint paths: `GET /accounts/:id/withdrawals` and `GET /support/accounts/:id/withdrawals[/:operationId]`.
2. Cursor-based pagination.
3. New error codes `WITHDRAWAL_NOT_FOUND` and `INVALID_DATE_RANGE`.
4. Empty list returned for an account with no withdrawals.
5. Audit write failure fails the lookup.

## 5. Next steps

1. Developers review section 4 and resolve the read-path decision.
2. Client confirms the PROVISIONAL defaults and answers the OPEN items in section 3.
3. Build WH-01 to WH-04 in a branch after review. Release stays blocked until access control and audit are decided.
4. Derive `test-matrix.md` from these acceptance criteria.
