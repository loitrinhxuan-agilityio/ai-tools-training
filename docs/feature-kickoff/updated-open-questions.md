# Client Questions — Withdrawal History & Visibility

**Status:** Simulated client decisions recorded for the training exercise (rounds 1 and 2). Not real client approval.
**Project:** Banking Event-Sourcing Capstone
**For:** BA, QA, and development team
**Source:** [client-brief.md](client-brief.md)
**Client feedback:** [client-feedback.md](client-feedback.md)

Withdrawal processing is already implemented. This kickoff explores improving withdrawal history and investigation capabilities for customers and support staff.

Every decision below is **simulated**. Keep provisional assumptions, OPEN items, and engineering proposals visibly separate from simulated client decisions.

## Current behavior (for reference)

- A successful withdrawal persists a `money-withdrawn` event on the account stream, with the amount and `operationId`.
- A withdrawal rejected for insufficient funds throws before any event is applied. Nothing is persisted for that attempt, so support cannot see it in the event history today.
- A withdrawal with a reused `operationId` returns `duplicate` or raises `OPERATION_ID_REUSED`. Neither is stored as a separate record.
- No endpoint returns withdrawal details or status by `operationId`. Deposits have one: `GET /accounts/:id/deposits/:operationId`.
- The account event history endpoint returns raw events, which the client wants to avoid exposing to customers.
- No authentication, authorization, or audit code exists in `src/`. Every route is open.

## Round 1 — decisions after client feedback (simulated)

Status meanings:
- **Confirmed for demo** — a simulated decision for this exercise; not real approval.
- **Provisional** — default or policy that still needs confirmation.
- **Open** — requires a decision before the relevant scope can be finalized or released.

| Question | Decision | Status |
|---|---|---|
| Q1 | Show amount, timestamp, `operationId`, and status. No failure reasons. | Confirmed for demo |
| Q2 | Show successful withdrawals only. Failed attempts out of scope. | Confirmed for demo |
| Q3 | Date-range and status filters, newest first, paginated. Defaults 90 days and 20 items. | Behavior confirmed; defaults provisional. Status filter superseded in round 2. |
| Q4 | Separate support view. Lookup by account plus `operationId`, or account plus date range. Audit lookups. No support actions. | Confirmed for demo |
| Q5 | Customers see only their own accounts; support sees across accounts. Auth not implemented; customer release blocked. | Visibility confirmed; approach open |
| Q6 | Retain for the life of the account, no deletion. Legal requirements unverified. | Provisional; legal open |
| Q7 | First release: customer history and support lookup. Failed-attempt history and support actions out of scope. | Scope confirmed; deadline open |
| B1 | Defer customer release until authentication and account ownership are defined and implemented. | Ownership OPEN |
| B2 | Support lookups need an authorized role and a case ID or reason. | Role tiers and audit access OPEN |
| B3 | Block release until authorization is implemented and tested. Internal demos need approved access restrictions. | Restriction definition OPEN; see 2b item 2 |
| B4 | Audit lookups with staff ID, account, query, timestamp, case ID/reason. Prefer blocking lookups if audit fails. Audit customer lookups when introduced. | Subject to security review |
| B5 | Transaction and audit retention OPEN pending legal/compliance guidance. | OPEN |
| P1 | UTC. Inclusive bounds. Date-only `to` covers the whole day. 90-day default only when neither date is given. No maximum range. | Confirmed for demo |
| P2 | Default 20, maximum 100, next/previous navigation, no total count. | Confirmed for demo (round 2 cap) |
| P3 | Empty list with a message. 404 for unknown `operationId`. Same not-found for unknown and unauthorized accounts. Failed-attempt notice stated. | Confirmed for demo (round 2 refines the empty-list rule) |
| P4 | Successful withdrawals only. Status filter omitted until more statuses exist. | Confirmed for demo; **conflicts with round 1 Q3**, resolved in round 2 |
| P5 | Accept the limitation. Failed-withdrawal visibility is a future feature with design review. | Confirmed for demo |
| D1 | No resulting balance in the first release. | Confirmed for demo |
| D2 | One history entry per `operationId`. | Confirmed for demo |
| D3 | Defer customer lookup by `operationId`. | Confirmed for demo |
| D4 | Summarized information only. No underlying events. | Confirmed for demo |
| D5 | Target set by completion of authentication, authorization and audit decisions. No fixed date. | Confirmed for demo |
| D6 | Same fields for customers and support. Case ID and audit metadata stay in the audit record. | Confirmed for demo |

## Round 2 — resolutions (simulated)

Round 2 rows cite one of three lists. The lists come from three client replies; labels here and in the other docs use these names:

- **2a** — the Q-numbered answers (Q1.1–Q6.3).
- **2b item N** — the nine-item product list: 1 empty results; 2 existing open routes; 3 support authentication; 4 audit failure; 5 case ID; 6 date rules; 7 page size; 8 demo approval; 9 review date.
- **2c item N** — the six-item list: 1 future dates; 2 pagination (bare list); 3 route protection; 4 raw event history; 5 stakeholder ownership; 6 audit of denied attempts.

Where a decision appears in more than one list, the row names the list it was taken from.

Cross-references for 2b items with no separate row (existing entries cover them; nothing is duplicated):
- **2b item 2** (existing open routes) → covered by the **2c item 3** row (route protection).
- **2b item 6** (date rules) → covered by the **Q3.1–Q3.6** rows.
- **2b item 7** (page size) → covered by the **Q4.1–Q4.2** rows.
- **2b item 9** (review date) → covered by the **Q6.3** row, and the **2c item 5** row (stakeholders).

| Item | Decision | Status |
|---|---|---|
| Q1.1 | Drop the status filter. | Confirmed for demo; resolves conflict A |
| Q1.2 | Keep `status` in each item, always `succeeded`. | Confirmed for demo |
| Q2.1 | Audit customer lookups from the first customer endpoint. | Confirmed for demo; reverses the WH-04 proposal |
| Q2.2 | Customer audit records customer ID, account ID, query parameters, timestamp, and result count. One record per page request. | Confirmed for demo; storage OPEN |
| Q2.3 | Support case ID is structured, plus an optional note. No case-system integration. | Confirmed for demo; format OPEN |
| Q2.4 | Case ID required on both support lookup types. | Confirmed for demo |
| Q3.1 | `from` only → `to` = now. | Confirmed for demo |
| Q3.2 | `to` only → start of history. | Confirmed for demo |
| Q3.3 | Rolling 90 days, applied only when both dates are omitted. | Confirmed for demo; edge inclusivity PROVISIONAL |
| Q3.4 | Date-only and full timestamps accepted. Date-only `from` = UTC midnight. Date-only `to` = whole UTC day. | Confirmed for demo |
| Q3.5 | Reversed dates rejected. | Confirmed for demo |
| Q3.6 | Malformed dates rejected. | Confirmed for demo |
| Q4.1 | Page size above 100 capped at 100. | Confirmed for demo |
| Q4.2 | Zero, negative, and non-numeric page sizes rejected. | Confirmed for demo |
| Q5.1–Q5.3 | Failed-attempt notice in documentation and help text, not API responses. Suggested wording: "Only successful withdrawals appear in history; failed attempts are not recorded." | Confirmed for demo; wording is a suggestion |
| Q6.1 | Support lookup may ship before customer history once authorization and audit pass. | Confirmed for demo |
| Q6.2 | Internal demos use test data only, in private or local environments, with security reviewer approval. No production data. | Confirmed for demo; reviewer role OPEN |
| Q6.3 | A review date is needed before implementation planning. | Confirmed for demo; date OPEN |
| 2b item 1 | Empty results return a bare empty list. The UI displays "No withdrawals found". Failed-attempt notices stay in documentation. | Confirmed for demo |
| 2c item 1 (future dates) | Reject future timestamps and future `from`. Date-only `to` for today (UTC) includes the whole day. `from = to` is valid. Clock tolerance left to engineering. | Confirmed for demo |
| 2c item 2 | Keep the response body a bare list. Engineering chooses the next/previous cursor mechanism without breaking compatibility. | Confirmed for demo |
| 2c item 3 | Protect all routes before any real release, including write routes. Authentication design subject to security review. | Confirmed for demo; mechanism OPEN |
| 2c item 4 | Keep raw event history for existing functionality, restricted to an authorized internal or security role before release. Tests must verify access control. | Confirmed for demo |
| 2c item 5 | Project lead identifies the security reviewer and stakeholders. Review date stays OPEN until they are identified. | Confirmed for demo; date OPEN |
| 2c item 6 | Audit denied access and rejected support lookups, including missing or invalid case IDs. Empty-result auditing is covered by the audit design review. | Confirmed for demo; empty-result auditing OPEN |
| 2b item 4 (audit failure) | Audit recording failure blocks customer and support reads. | Confirmed for demo; subject to security review |
| 2b item 3 (support authentication) | Support authentication mechanism stays OPEN for security review. Support-first release cannot ship without it. | OPEN (release gate) |
| 2b item 8 | Demos need documented sign-off from the designated security reviewer. Reviewer role and checklist stay OPEN. | Confirmed for demo; role OPEN |

## Conflicts with earlier documents

Recorded here; resolved in the updated docs listed in section "Document updates".

- **A. Status filter.** Round 1 Q3 and `spec.md` / `tickets.md` / `test-matrix.md` listed a status filter. Round 2 dropped it. Resolved: the filter is removed.
- **B. Customer audit.** `tickets.md` WH-04 and `TC-WH04-003` said customer lookups are not audited. Round 2 audits them. Resolved: reversed.
- **C. Case ID.** Earlier WH-02/WH-03 had no case ID. Round 2 requires one. Resolved: added.
- **D. Empty-result list versus notice.** Round 1 P3 asked for a message in the response. Round 2 keeps a bare list. Resolved: bare list, notice in docs.
- **E. Unknown and unauthorized accounts.** Round 1 P3 gives the same response. Round 2 does not change it. Resolved: unchanged.

## Remaining OPEN items

Product:
- Customer authentication and account ownership model (B1).
- Support role tiers and who reads audit records (B2, B4).
- Audit retention and legal/compliance requirements (B5).
- Empty-result auditing (2c item 6).
- `pending` and `reversed` statuses (Q2).
- Edge inclusivity of the 90-day window (Q3).
- Confirmation of the 90-day and 20-item defaults (Q3).
- Response field name: `amount` vs `amountMinor` (API contract; `developer-review.md` item 7). Not decided by the simulated client.
- Review date and security reviewer identity (2c item 5; 2b item 8).

Engineering (not client decisions):
- Authentication and route protection mechanisms, including protecting existing routes (2c item 3; support authentication 2b item 3).
- Audit storage, fields, and failure handling (security review).
- Next/previous cursor mechanism.
- Case ID format and length limits.
- Error codes (`WITHDRAWAL_NOT_FOUND`, `INVALID_DATE_RANGE`, and codes for case ID, page size, and date validation).
- Clock tolerance for future-date checks.
- Read path: replay or projection.
- Timestamp source (envelope `occurredOn`).

## Document updates

Round 2 changes are reflected in:
- `spec.md`: rewritten for round 2.
- `tickets.md`: WH-01 through WH-04 updated, and a route-protection ticket added.
- `test-matrix.md`: retired and rewritten cases, new cases, and recalculated summaries.
- `client-feedback.md` and `open-questions.md`: note added that they predate round 2.
