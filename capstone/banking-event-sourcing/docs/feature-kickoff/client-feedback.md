# Client Feedback — Withdrawal History & Visibility

**Project:** Banking Event-Sourcing Capstone  
**Source:** Client Clarification Email — Withdrawal History & Visibility  
**Status:** Assumed client feedback for Day 12 training simulation  
**Note:** This document records simulated client feedback only. `open-questions.md` has not been updated yet.

## Feedback on the Proposed Scope

### Q1 — Customer visibility
Show the following details for each withdrawal:
- Amount
- Timestamp
- `operationId`
- Status

Do not show failure reasons in the first release.

**Decision status:** Confirmed for the training simulation.

### Q2 — Withdrawal statuses
Show successful withdrawals only in the first release. Failed attempts are out of scope.

**Decision status:** Confirmed for the training simulation.

### Q3 — History experience
Provide:
- Date-range filtering
- Status filtering
- Newest-first sorting
- Pagination

Proposed defaults for the demo:
- Default lookback period: 90 days
- Page size: 20 items

These defaults are assumptions for the training exercise and should be treated as provisional until explicitly confirmed.

**Decision status:** Proposed behavior accepted for the training simulation; defaults provisional.

### Q4 — Support lookup
Provide a separate support view that allows support staff to find a withdrawal using either:
- Account plus `operationId`; or
- Account plus date range.

Audit support lookups. The first release will not allow support staff to take actions on withdrawals.

**Decision status:** Confirmed for the training simulation.

### Q5 — Access control
Customers must only be able to see their own accounts. Support staff may look up withdrawals across accounts.

Authentication and authorization are not currently implemented. The customer-facing release must be treated as blocked until an appropriate access-control approach is agreed and implemented.

**Decision status:** Visibility expectations confirmed for the training simulation; implementation and release dependency remains unresolved.

### Q6 — History retention
The proposed behavior is to retain history for the life of the account, with no deletion in the first release.

Legal and regulatory retention requirements have not been verified and must be confirmed before production use.

**Decision status:** Provisional.

### Q7 — Scope and deadline
The first release includes:
- Customer withdrawal history
- Support withdrawal lookup

Out of scope:
- Failed-attempt history
- Support actions on withdrawals

The delivery deadline remains undecided.

**Decision status:** Scope confirmed for the training simulation; deadline open.

## Summary of Remaining Decisions and Risks

1. Confirm whether the 90-day default lookback and page size of 20 are acceptable.
2. Confirm applicable legal and regulatory retention requirements before production use.
3. Define the authentication and authorization approach before exposing customer withdrawal history.
4. Agree on a target delivery deadline.

## Next Step

Use this feedback to update `docs/feature-kickoff/open-questions.md`. Keep confirmed-for-demo decisions distinct from provisional assumptions and unresolved production requirements.
