# Client Clarification Email — Withdrawal History & Visibility

**Suggested file path:** `docs/feature-kickoff/client-clarification-email.md`

**Subject:** Confirmation Needed: Withdrawal History & Support Lookup Requirements

Hi,

Following our review of the existing Banking application, I've drafted the proposed scope for improving withdrawal history and support investigation. Before I finalize the specification and tickets, could you please review the proposals below and confirm or correct them?

## Proposed first-release scope

1. **Customer withdrawal history:** Show successful withdrawals with the amount, timestamp, operation ID, and status. Do not show failure reasons in the first release.
2. **Statuses:** Include successful withdrawals only. Failed attempts and support actions would remain out of scope.
3. **History experience:** Allow filtering by date range and status, sort newest first, and use pagination.
4. **Support lookup:** Provide a separate support view to find a withdrawal by account plus operation ID, or by account plus date range. Audit support lookups. The view would not allow support staff to take actions on withdrawals.
5. **Visibility:** Customers should only see their own accounts; support staff may look up withdrawals across accounts.
6. **Retention:** The current proposal is to retain history for the life of the account, with no deletion in the first release.

## Decisions to confirm

Could you please confirm the proposed scope above and clarify these points?

- **History defaults:** What default lookback period and page size should we use?
- **Retention and legal requirements:** Are there legal or regulatory retention requirements we must follow? Who should confirm them? Until this is confirmed, I'll keep the proposed lifetime retention rule provisional.
- **Access control:** Authentication and authorization are not currently implemented in the application and were initially proposed as out of scope. Can customer history safely be included in the first release without those controls, or should access control be included or treated as a release blocker?
- **Delivery deadline:** What is the target deadline for the first release?

I'll record your answers in the requirements log and keep unresolved decisions open. I won't treat these proposals as approved requirements until you confirm them.

Thanks,
Business Analyst
