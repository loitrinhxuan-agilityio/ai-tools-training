# Client Questions — Withdrawal History & Visibility

**Status:** Client feedback received; decision log updated for the training simulation  
**Project:** Banking Event-Sourcing Capstone  
**For:** BA, QA, and development team  
**Source:** [client-brief.md](client-brief.md)  
**Client feedback:** [client-feedback.md](client-feedback.md)

Withdrawal processing is already implemented. This kickoff explores improving withdrawal history and investigation capabilities for customers and support staff.

This document records the current codebase behavior, client questions, and the status of each decision. The client feedback is assumed for this training simulation, not real client approval. Keep provisional assumptions and unresolved production requirements visible.

## Current behavior (for reference)

- A successful withdrawal persists a `money-withdrawn` event on the account stream, with the amount and `operationId`.
- A withdrawal rejected for insufficient funds throws before any event is applied. Nothing is persisted for that attempt, so support cannot see it in the event history today.
- A withdrawal with a reused `operationId` returns `duplicate` or raises `OPERATION_ID_REUSED`. Neither is stored as a separate record.
- No endpoint returns withdrawal details or status by `operationId`. Deposits have one: `GET /accounts/:id/deposits/:operationId`.
- The account event history endpoint returns raw events, which the client wants to avoid exposing.

## Questions for the Client

### Q1. Customer visibility

What information should customers see for each withdrawal?

- Should a customer see the `operationId`, or a separate reference?
- Should a resulting balance be displayed?

### Q2. Withdrawal statuses

Should history show only successful withdrawals, or also failed attempts?

- Is `succeeded` enough, or are `pending` or `reversed` needed?
- Failed attempts are not stored today. If they become visible, they must be recorded, which changes the event-sourcing design.

### Q3. Customer history

Should customers see all withdrawal records, or should history support filters?

- How far back should history go by default?
- What page size should pagination use?
- Should history be sorted newest first?

### Q4. Support investigation

How should support staff find a withdrawal?

- What does support need to answer “What happened to my withdrawal?” in one lookup?
- Do support staff need the underlying events, or a summarized view?
- Do support staff need to act from this view, such as flagging a withdrawal for review?
- Must support lookups be audited, such as logging who viewed which account?

### Q5. Access control

What information may support staff see, and should customers be restricted to their own accounts?

- Can support see every account, or only assigned accounts?
- Are any fields hidden from support or customers?
- The codebase has no authentication or authorization yet. What access-control approach is required before customer history is exposed?

### Q6. History retention

How long should withdrawal history remain available?

- Are there legal or regulatory retention requirements, and who confirms them?
- After a retention period, should data be deleted, archived, or anonymized?
- Events are immutable. Any deletion requirement needs a technical design decision.

### Q7. Scope and priority

What is in the first release?

- Is there a target deadline?
- Are failed-attempt history or support actions out of scope for now?

## Decisions after client feedback

Status meanings:

- **Confirmed for demo** — accepted for this training simulation; not real client approval.
- **Provisional** — proposed default or policy that still needs confirmation.
- **Open** — requires a decision before the relevant scope can be finalized or released.
- **Confirmed with dependency** — business expectation is agreed, but a prerequisite remains unresolved.

| Question | Client feedback / decision | Status |
|---|---|---|
| Q1 | Show amount, timestamp, `operationId`, and status. Do not show failure reasons in the first release. | Confirmed for demo |
| Q2 | Show successful withdrawals only. Failed attempts are out of scope for the first release. | Confirmed for demo |
| Q3 | Support date-range and status filters, newest-first sorting, and pagination. Default lookback is proposed as 90 days and page size as 20 items. | Behavior confirmed for demo; defaults provisional |
| Q4 | Provide a separate support view. Lookup by account plus `operationId`, or by account plus date range. Audit support lookups. No support actions in the first release. | Confirmed for demo |
| Q5 | Customers should see only their own accounts; support staff may look up withdrawals across accounts. Authentication and authorization are not implemented. Customer-facing release must be blocked until an appropriate access-control approach is agreed and implemented. | Visibility expectations confirmed for demo; access-control approach open |
| Q6 | Proposed retention is for the life of the account, with no deletion in the first release. Legal and regulatory retention requirements have not been verified. | Provisional; legal requirements open |
| Q7 | First release includes customer withdrawal history and support lookup. Failed-attempt history and support actions are out of scope. No delivery deadline has been set. | Scope confirmed for demo; deadline open |

## Remaining decisions and risks

1. Confirm whether the proposed 90-day default lookback and page size of 20 are acceptable.
2. Confirm legal and regulatory retention requirements, and who is responsible for validating them, before production use.
3. Agree on an authentication and authorization approach before exposing customer withdrawal history. Do not treat customer-only visibility as enforced by the current codebase.
4. Set the target delivery deadline.
5. Define the minimum audit fields and access to support lookup audit records before finalizing the audit requirement.

## Notes for the team

- These are assumed client decisions for a training simulation, not actual client approval.
- Only confirmed-for-demo decisions should be treated as agreed for the exercise. Provisional assumptions and unresolved production dependencies must remain explicit.
- Failed-attempt storage and retention/deletion requirements may affect the event-sourcing design and need developer review if the scope changes.
- Developers should raise implementation questions through tickets once the specification and ticket pack are drafted.
- Do not expose raw account event history as the customer-facing history response.

## Next step

Use this updated decision log to draft `spec.md`. Clearly mark provisional defaults and the access-control and legal-retention dependencies. Then derive `tickets.md` and `test-matrix.md` from the agreed scope and acceptance criteria.
