# Client Brief — Withdrawal History & Visibility

**Project:** Banking Event-Sourcing Capstone  
**Status:** Initial brief — clarification required

## Background

The Banking application already supports withdrawals, including insufficient-funds handling, event sourcing, idempotency, and concurrency protection.

However, customers and support staff need better visibility into withdrawal activity.

## Client Request

We'd like customers to have a clearer understanding of their withdrawal history. When a customer asks, "What happened to my withdrawal?", support staff should be able to investigate without digging through technical event logs.

We haven't decided exactly what information should be displayed, how long history should be retained, or whether customers need to see only successful withdrawals or failed attempts too.

Please investigate the requirements and come back with questions before proposing a solution.

## Initial Constraints

- Existing withdrawal processing is already implemented.
- The current withdrawal behavior and event-sourcing architecture should be considered existing functionality.
- The scope of the new feature has not yet been agreed.
- Do not assume that failed withdrawal attempts are currently persisted.

## Open Areas

- Customer-visible withdrawal details and statuses.
- Withdrawal history and filtering.
- Support investigation capabilities.
- Access control and data visibility.
- History retention requirements.
- First-release scope and priorities.
