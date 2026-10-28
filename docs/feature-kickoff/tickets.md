# Tickets — Withdrawal History & Visibility

**Status:** DRAFT for developer review. Not final.
**Basis:** [spec.md](spec.md), [updated-open-questions.md](updated-open-questions.md) (rounds 1 and 2), [client-feedback.md](client-feedback.md)
**Note:** Client decisions are **simulated** for the Day 12 training exercise. They are not real client approval.

## Scope rule for this draft

Requirements labelled **Confirmed for demo** (including round 2) are ticketed. PROVISIONAL, OPEN, and BLOCKED items are listed in section 3 and are **not** ticketed as final. No client decision has been invented or silently resolved.

## Labels

- **Confirmed for demo** — simulated decision for the training exercise; not real client approval.
- **PROVISIONAL** — default value kept as provided; needs client confirmation.
- **OPEN** — decision still required.
- **BLOCKED** — cannot be released until the named dependency is resolved.
- **ENG PROPOSAL** — engineering suggestion for developer review; not a client decision.

## 1. Tickets

### WH-01 — Customer withdrawal history: list endpoint

**Goal:** A customer can list their own successful withdrawals for one account.

**Scope:**
- New read endpoint. **ENG PROPOSAL:** `GET /accounts/:id/withdrawals`.
- Response: a bare list. Each item has amount (minor units), timestamp, `operationId`, and `status` (always `succeeded`). — Confirmed for demo (Q1, round 2 Q1.2).
- Only successful withdrawals. One entry per `operationId`. — Confirmed for demo (Q2, round 1 D2).
- **No status filter.** — Confirmed for demo (round 2, Q1.1).
- Date-range filter with the rules in `spec.md` §4.7 (UTC, inclusive, `from`/`to` defaults, reject reversed, malformed, timezone-less, and future dates). — Confirmed for demo (round 2).
- Sorted newest first, next/previous navigation, no total count. — Confirmed for demo (round 1 Q3, round 2 P2).
- Default lookback 90 days, only when neither date is given, rolling. — **PROVISIONAL.**
- Default page size 20. Values above 100 are capped at 100. Zero, negative, non-integer, and non-numeric values are rejected. — Default **PROVISIONAL**; cap and rejection Confirmed for demo (round 2 Q4).
- Cursor mechanism for next/previous — **ENG PROPOSAL.** Must not change the bare-list body (2c item 2).
- Empty account or no matches returns a bare empty list (200). — Confirmed for demo (2b item 1).

**Out of scope:**
- Failed attempts and failure reasons. — Confirmed for demo (Q1, Q2).
- Resulting balance field. — Confirmed for demo (round 1 D1).
- Raw account event history. — Excluded by the decision log.
- `pending` and `reversed` statuses. — **OPEN.**
- Customer lookup by `operationId`. — Deferred (round 1 D3).

**Dependencies:**
- **BLOCKED (round 1 B1):** customer release needs authentication and account ownership. Ownership relationships are **OPEN**.
- **BLOCKED (2c item 3):** route protection for all existing routes before real release. Mechanism **OPEN** for security review.
- **BLOCKED (WH-04):** each page request is audited (round 2 Q2.1–Q2.2). Audit storage and design are **OPEN**; audit failure blocks the read.
- **OPEN (developer decision):** read path — replay of `account-<id>` or a projection. Phase 3 in `CLAUDE.md`.
- **ENG PROPOSAL:** timestamp taken from the stored envelope (`occurredOn`), not the payload.

**Acceptance criteria:**
- [ ] Each item contains exactly `amount`, `timestamp`, `operationId`, and `status`. — Confirmed for demo.
- [ ] A withdrawal rejected for insufficient funds never appears in the response. — Confirmed for demo.
- [ ] A retried `operationId` appears once. — Confirmed for demo (round 1 D2).
- [ ] Items are sorted newest first. — Confirmed for demo.
- [ ] `from` / `to` date-range filter follows the §4.7 rules. — Confirmed for demo (round 2).
- [ ] No status filter parameter is implemented. — Confirmed for demo (round 2).
- [ ] With no dates given, the default lookback is 90 days. — PROVISIONAL.
- [ ] With no page size given, 20 items are returned per page. — PROVISIONAL.
- [ ] `pageSize` above 100 returns at most 100 items. — Confirmed for demo (round 2).
- [ ] `pageSize` of zero, negative, non-integer, or non-numeric returns 400. — Confirmed for demo (round 2); error code ENG PROPOSAL.
- [ ] An account with no matches returns 200 with an empty list. — Confirmed for demo (round 2).
- [ ] An unknown account returns `404 ACCOUNT_NOT_FOUND`. — Existing code; same response as unauthorized (round 1 P3).
- [ ] A malformed account ID returns `400`. — Status confirmed. The error code is **OPEN**: `:id` routes return 400 with no `code` today (`ParseUUIDPipe`), and `developer-review.md` item 7 records the question.
- [ ] No response includes a failure reason, a balance, or raw event payloads. — Confirmed for demo.
- [ ] Each page request writes one audit record. — Confirmed for demo (round 2); storage OPEN.
- [ ] Customer-facing release: **BLOCKED** until authentication, ownership, route protection, and audit are implemented and tested.

**Implementation split (resolves the build-vs-audit conflict):**
- **Buildable now:** the internal list query, the date-range and page-size rules, paging, and handler tests. This is `GetWithdrawalHistoryHandler`, built on Day 12 and not exposed.
- **Not buildable yet:** the `GET /accounts/:id/withdrawals` route, the per-page audit write, and any customer-facing exposure. These wait for WH-04 (audit design approved) and SEC-01 (route protection).

**Release status:** Release **BLOCKED** on authentication, ownership, route protection, and audit.

---

### WH-02 — Support lookup: by account and `operationId`

**Goal:** A support staff member with an authorized role can find one withdrawal and see its outcome.

**Scope:**
- Separate support endpoint, not the customer endpoint. **ENG PROPOSAL:** `GET /support/accounts/:id/withdrawals/:operationId`.
- Response: the same summarized fields as WH-01. — Confirmed for demo (round 1 D4, D6).
- **Required structured case ID** plus optional note on the request. Format and length limits **OPEN** for engineering review. — Confirmed for demo (round 2 Q2.3–Q2.4).
- Case ID and note are stored in the audit record, not the response. — Confirmed for demo (round 1 D6).
- Not found: `404` for an `operationId` with no successful withdrawal on that account. — Confirmed for demo (round 1 P3); error code `WITHDRAWAL_NOT_FOUND` **ENG PROPOSAL**.
- Each lookup is audited (WH-04).
- Unknown and unauthorized accounts return the same not-found response. — Confirmed for demo (round 1 P3).
- No action endpoints. — Confirmed for demo (round 1 Q4, Q7).

**Out of scope:**
- Support actions such as flagging or reversing. — Confirmed for demo as excluded.
- Underlying events to support. — Confirmed for demo as excluded (round 1 D4).

**Dependencies:**
- **BLOCKED (round 1 B2):** support authorized role and role tiers are **OPEN**.
- **BLOCKED (2b item 3):** support authentication cannot ship without it. Mechanism **OPEN** for security review.
- **BLOCKED (WH-04):** audit must be defined before release.
- **OPEN (developer decision):** read path (same as WH-01).
- Support may ship before customer history once authorization and audit pass. — Confirmed for demo (round 2 Q6.1).

**Acceptance criteria:**
- [ ] Lookup by account and `operationId` returns the matching withdrawal with the WH-01 field set. — Confirmed for demo.
- [ ] A lookup with no case ID (parameter name and location OPEN) returns 400. — Confirmed for demo (round 2); error code ENG PROPOSAL.
- [ ] A lookup with a note but no case ID returns 400. — Confirmed for demo (round 2).
- [ ] A lookup with a valid case ID and optional note succeeds, and the case ID and note appear in the audit record only. — Confirmed for demo (round 1 D6, round 2 Q2.3).
- [ ] An `operationId` with no successful withdrawal on that account returns `404`. — Confirmed for demo; code ENG PROPOSAL.
- [ ] A reused `operationId` for a different account is not returned. — Confirmed for demo (scoping is by account).
- [ ] Unknown account returns `404 ACCOUNT_NOT_FOUND`, the same as an unauthorized account. — Confirmed for demo (round 1 P3).
- [ ] Failed attempts are not returned. — Confirmed for demo (Q2).
- [ ] No response includes raw event payloads. — Confirmed for demo (round 1 D4).
- [ ] No action endpoint is registered. — Confirmed for demo.
- [ ] Cross-account access requires an authorized role; **BLOCKED** until authorization exists.

**Implementation split:** the handler and the 404 status can be built after the error-code decision (G3). The route, case-ID validation, and audit wait for WH-04 and support authentication.

**Release status:** Release **BLOCKED** on WH-04, support authentication, and authorization.

---

### WH-03 — Support lookup: by account and date range

**Goal:** A support staff member with an authorized role can list one account's withdrawals within a date range.

**Scope:**
- Support endpoint. **ENG PROPOSAL:** `GET /support/accounts/:id/withdrawals?from=&to=&pageSize=&cursor=`.
- Same response fields, pagination, and date rules as WH-01. — Confirmed for demo (round 2).
- Structured case ID plus optional note, required. — Confirmed for demo (round 2 Q2.4).
- Reversed dates return 400. Malformed dates and timezone-less timestamps return 400. Future `from` or `to` returns 400. — Confirmed for demo (round 2); error codes ENG PROPOSAL.
- `from` equal to `to` is valid. — Confirmed for demo (round 2).
- Each lookup is audited (WH-04). Rejected lookups are audited too (2c item 6).

**Dependencies:**
- WH-04 (audit).
- **BLOCKED (round 1 B2; 2b item 3):** support authorization and authentication.
- **OPEN (developer decision):** read path.

**Acceptance criteria:**
- [ ] Only withdrawals with `from <= timestamp <= to` are returned. — Confirmed for demo (round 1 P1).
- [ ] Date-only `to` includes the whole UTC day. — Confirmed for demo (round 2).
- [ ] `from` after `to` returns 400. — Confirmed for demo; code ENG PROPOSAL.
- [ ] A date-only `from` starts at UTC midnight. — Confirmed for demo (round 2).
- [ ] A future `from` or `to` returns 400. — Confirmed for demo (round 2).
- [ ] Default 90-day lookback applies only when neither `from` nor `to` is given. — PROVISIONAL.
- [ ] A missing case ID returns 400 and the attempt is audited. — Confirmed for demo (round 2).
- [ ] Failed attempts are not returned. — Confirmed for demo (Q2).
- [ ] Each lookup is audited. — Confirmed for demo (round 1 B4).
- [ ] A lookup with no matches returns 200 with an empty list. — Confirmed for demo (round 2).
- [ ] Cross-account access is **BLOCKED** until authorization exists.

**Implementation split:** the date and page-size rules from the internal list (Day 12) can be reused. The route, case ID, and audit wait for WH-04 and support authentication.

**Release status:** Release **BLOCKED** on WH-04, support authentication, and authorization.

---

### WH-04 — Audit of customer and support lookups

**Goal:** Every customer page request and every support lookup of withdrawal data, plus every denied or rejected attempt, is recorded. Audit failure blocks the read.

**Scope:**
- **Support lookups:** staff ID, account ID, query details (`operationId` or date range, with `from`/`to`), timestamp, case ID, and note. — Confirmed for demo (round 1 B4, round 2 Q2.3).
- **Customer lookups:** customer ID, account ID, query parameters, timestamp, and result count. One record per page request. — Confirmed for demo (round 2 Q2.1–Q2.2). Reverses the earlier proposal that customer lookups are not audited.
- **Denied and rejected attempts:** unauthorized account access, and rejected support lookups (including missing or invalid case IDs). — Confirmed for demo (2c item 6).
- **Rejected customer requests** (invalid dates or page sizes on the customer list): **not decided by the client.** Whether they are audited is **OPEN** for the audit design review. This ticket does not require it.
- **Empty-result auditing:** **OPEN**, covered by the audit design review (2c item 6).
- **Failure behavior:** audit recording failure blocks the read for both customer and support. — Confirmed for demo (2b item 4), subject to security review.
- Audit records are written before the response is returned. — **ENG PROPOSAL.**

**Dependencies:**
- **OPEN:** storage location. Developers must not choose it silently; it changes the event-sourcing design if placed on the account stream.
- **OPEN:** who may read audit records, and the audit retention period (round 1 B5).
- **BLOCKED (round 1 B1, B2):** the customer and staff identity needed for audit records cannot be captured reliably until authentication exists.
- **OPEN:** audit volume under abuse (denied-attempt auditing).

**Acceptance criteria:**
- [ ] Every support lookup in WH-02 and WH-03 produces one audit record. — Confirmed for demo.
- [ ] Every customer page request in WH-01 produces one audit record. — Confirmed for demo (round 2).
- [ ] Denied access and rejected support lookups produce an audit record. — Confirmed for demo (2c item 6).
- [ ] A failed audit write blocks the read, for customer and support. — Confirmed for demo (round 2), subject to security review.
- [ ] Audit records are not stored on the `account-<id>` stream. — ENG PROPOSAL; developers to confirm.
- [ ] Audit record fields match the agreed minimum set. — Confirmed for demo at the level of fields in round 1 B4 and round 2 Q2.2–Q2.3; exact schema **OPEN**.
- [ ] Empty-result auditing. — **OPEN**.

**Release status:** **OPEN.** Do not implement the storage design until security review. Not released.

---

### SEC-01 — Route protection and raw event history

**Goal:** Existing and new routes require authentication before any real release, and raw event history is limited to an authorized internal or security role.

**Scope:**
- Authentication on every route, including write routes: `POST /accounts`, `POST /accounts/:id/deposits`, `POST /accounts/:id/withdrawals`, `GET /accounts/:id`, `GET /accounts/:id/deposits/:operationId`, `GET /accounts/:id/events`. — Confirmed for demo (2c item 3).
- `GET /accounts/:id/events` kept for existing functionality, restricted to an authorized internal or security role. — Confirmed for demo (2c item 4).
- Tests verify access control on each route. — Confirmed for demo (2c item 4).
- Mechanism **OPEN** for security review.

**Dependencies:**
- Security reviewer design (2b item 8, OPEN).
- Existing HTTP tests call routes without credentials. They need updating (`src/accounts/accounts.http.spec.ts`).
- `TC-REG-008` asserts the raw event endpoint returns stream order. It needs updating.

**Acceptance criteria:**
- [ ] An unauthenticated request to any route is refused. — Confirmed for demo; **BLOCKED** on mechanism.
- [ ] A request to `GET /accounts/:id/events` without the internal role is refused. — Confirmed for demo; **BLOCKED** on role design.
- [ ] Existing tests are updated to authenticate and still pass. — Existing rule.

**Release status:** **BLOCKED** until the security reviewer designs it.

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
| Customer authentication and account ownership | BLOCKED (round 1 B1) | Customer release | Client and security review |
| Support authentication mechanism | OPEN (2b item 3) | Support release | Security reviewer |
| Support role tiers and audit readers | OPEN (round 1 B2, B4) | Support authorization, audit access | Client and security review |
| Route protection mechanism | OPEN (2c item 3) | Any real release | Security reviewer |
| Raw event history role | OPEN (2c item 4) | `/events` release | Security reviewer |
| Audit storage location and schema | OPEN | WH-04 | Developers and security reviewer |
| Audit retention and legal/compliance | OPEN (round 1 B5) | Production use | Client compliance |
| Empty-result auditing | OPEN (2c item 6) | WH-04 | Security reviewer |
| Case ID format and length limits | OPEN (round 2 Q2.3) | WH-02, WH-03 validation | Developers |
| Confirm 90-day lookback default | PROVISIONAL | Final default | Client |
| Confirm page size of 20 | PROVISIONAL | Final default | Client |
| Edge inclusivity of the 90-day window | PROVISIONAL | Final default | Client |
| `pending` and `reversed` statuses | OPEN | Status list | Client |
| Failed-withdrawal visibility | Future feature (round 1 P5) | Separate design review | Client and developers |
| Read path: replay or projection | OPEN (developer) | WH-01, WH-02, WH-03 | Developers |
| Response field name: `amount` vs `amountMinor` | OPEN (`developer-review.md` item 7). Not decided by the simulated client. | WH-01 to WH-03 response contract | Developers and client |
| Cursor mechanism for next/previous | ENG PROPOSAL | WH-01, WH-03 | Developers |
| Security reviewer identity, role and checklist | OPEN (2b item 8) | Demo sign-off | Project lead |
| Review date | OPEN (2c item 5) | Implementation planning | Project lead |

## 4. Engineering proposals for developer review

These are not client decisions. Each needs developer review before implementation.

1. Endpoint paths: `GET /accounts/:id/withdrawals` and `GET /support/accounts/:id/withdrawals[/:operationId]`.
2. Cursor-based pagination that keeps a bare-list body (2c item 2).
3. New error codes `WITHDRAWAL_NOT_FOUND`, `INVALID_DATE_RANGE`, and codes for missing case ID, invalid page size, and invalid date formats.
4. Clock tolerance for future-date checks.
5. Timestamp taken from the event envelope (`occurredOn`).
6. Audit written before the response is returned, and audit records stored outside the account stream.
7. Malformed-ID error shape (`TC-WH01-015`, `TC-WH02-006`): `ParseUUIDPipe` returns 400 with no `code` field.
8. Correction of `CLAUDE.md` line 26 (`whitelist` versus `forbidNonWhitelisted`).

## 5. Next steps

1. Security reviewer designs authentication, authorization, route protection, and audit (SEC-01, WH-04).
2. Project lead identifies the security reviewer and stakeholders, then sets the review date.
3. Developers review section 4 and resolve the read-path decision.
4. Client confirms the PROVISIONAL defaults and answers the OPEN items in section 3.
5. Build WH-01 to WH-03 only after the blockers are resolved. Release stays blocked until SEC-01 and WH-04 are approved.
6. Update `test-matrix.md` to match these acceptance criteria.
