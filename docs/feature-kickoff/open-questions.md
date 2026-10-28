# Client Questions — Withdrawal History & Visibility

**Status:** Awaiting client clarification  
**Project:** Banking Event-Sourcing Capstone  
**For:** QA, to walk through with the client  
**Source:** [client-brief.md](client-brief.md)

> **Superseded for planning:** this file is the original question list, written before any client feedback. The simulated decisions from rounds 1 and 2 are in [updated-open-questions.md](updated-open-questions.md). Use that file for current status.

Withdrawal processing is already implemented. This kickoff explores improving withdrawal history and investigation capabilities for customers and support staff.

Each question has a short note on what the codebase does today, so QA can tell real decisions from settled behavior. Examples in the notes are not requirements. Leave unanswered questions open.

## Current behavior (for reference)

- A successful withdrawal persists a `money-withdrawn` event on the account stream, with the amount and `operationId`.
- A withdrawal rejected for insufficient funds throws before any event is applied. **Nothing is persisted for that attempt**, so support cannot see it in the event history today.
- A withdrawal with a reused `operationId` returns `duplicate` or raises `OPERATION_ID_REUSED`. Neither is stored as a separate record.
- No endpoint returns withdrawal details or status by `operationId`. Deposits have one: `GET /accounts/:id/deposits/:operationId`.
- The account event history endpoint returns raw events, which the client wants to avoid exposing.

## Questions for the Client

### Q1. Customer visibility
What information should customers see for each withdrawal? For example, amount, date/time, status, operation ID, or resulting balance.

- Should a customer see the reason for a failure, such as insufficient funds? If so, what wording is acceptable?
- Should the customer see the `operationId`, or a separate reference?

### Q2. Withdrawal statuses
Should history show only successful withdrawals, or also failed attempts? If failed attempts should be included, which failure types matter?

- Is "succeeded" and "failed" enough, or are "pending" or "reversed" needed?
- **Failed attempts are not stored today.** If the client wants them visible, they must be recorded, which changes the event-sourcing design. Developers need to decide whether they go on the account stream or a separate stream.

### Q3. Customer history
Should customers see all withdrawal records, or should the history support filters such as date range and status?

- How far back should history go by default?
- Is pagination needed, and what page size?
- Should history be sorted newest first?

### Q4. Support investigation
How should support staff find a withdrawal? For example, by account ID, operation ID, or date range. Should support have a separate view from customers?

- What does support need to answer "What happened to my withdrawal?" in one lookup?
- Do support staff need the underlying events, or a summarized view?
- Do support staff need to act from this view, such as flagging a withdrawal for review? If so, that is a separate feature.
- Must support lookups themselves be audited, such as logging who viewed which account?

### Q5. Access control
What information may support staff see, and should customers be restricted to their own accounts?

- Can a support role see every account, or only accounts assigned to it?
- Are any fields hidden from support staff, or from customers?
- Does the customer use the same channel as today to see history, or a new one?
- **The codebase has no authentication or authorization yet.** This may need a separate decision.

### Q6. History retention
How long should withdrawal history remain available? Are there any retention or audit requirements we must follow?

- After the retention period, should data be deleted, archived, or anonymized?
- Which regulatory or legal requirements apply, and who confirms them?
- **Events are immutable.** A deletion requirement needs a developer decision before the client answers.

### Q7. Scope and priority
For the first release, what is most important: customer history, support investigation, or both? Are any capabilities explicitly out of scope?

- Is there a deadline for the first release?
- Are failed-attempt history or support actions out of scope for now?

## Decisions

Status meanings:

- **Proposed** — awaiting client confirmation. A proposed answer exists, but the client has not approved it.
- **Open** — requires client decision. No usable answer yet; the client must decide.
- **Confirmed** — approved by client. Only confirmed answers may be used to update `spec.md`.

> The answers below are **proposals drafted by Claude while role-playing the client**, to test the spec. They are not client decisions. Do not treat them as agreed requirements.

| Question | Proposed answer | Status |
|---|---|---|
| Q1 | Show amount, timestamp, `operationId`, and status. Show balance after the withdrawal only if it is stored. No failure reason in the first release. | Proposed |
| Q2 | First release shows successful withdrawals only. Failed attempts are out of scope unless the developers agree to store them. Statuses: `succeeded` only for now. | Proposed |
| Q3 | Filter by date range and status. Newest first, paginated. The default lookback and page size still need a client decision. | Open (defaults) |
| Q4 | Support finds a withdrawal by account and `operationId`, or by account and date range. Support has a separate view. No actions from this view. Lookups should be audited. | Proposed |
| Q5 | Support may see all accounts. Customers see only their own accounts. No fields hidden in the first release. Authentication and authorization are out of scope for the first release and need a separate decision. | Proposed |
| Q6 | Keep history for the life of the account. No deletion in the first release. Retention periods and legal requirements need a client decision. | Open (retention and legal) |
| Q7 | First release: customer history and support lookup. Out of scope: failed-attempt history and support actions. The deadline needs a client decision. | Open (deadline) |

## Notes for the team

- Q2 (failed-attempt storage) and Q6 (deletion vs. immutable events) change the event-sourcing design. Developers must review any answer before it is accepted.
- Q5 needs an authentication and authorization decision that does not exist yet.
