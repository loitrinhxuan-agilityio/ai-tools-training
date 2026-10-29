# WH-04 decision brief

**Status:** DRAFT. Recommendations only; nothing here is approved. Issue #12, `release-blocked`, `needs-security-review`, `area:audit`.
**Scope:** audit of customer and support lookups and of denied or rejected attempts, with reads blocked when the audit write fails.
**Depends on:** SEC-01 for caller identity. Do not start before SEC-01's S1 and S2 are approved.
**Simulated client input:** `updated-open-questions.md` (round 1 B4, B5; round 2 Q2.1 to Q2.3; 2b item 4; 2c item 6). It is not real approval.
**People not yet identified (names left open, none invented):** security reviewer, authorized technical lead, client compliance and legal contact.

## Decisions

| # | Decision | Recommended pick | Why | Alternatives not picked | Source | Decision-maker | Approved by / date |
|---|---|---|---|---|---|---|---|
| W1 | Storage location | Dedicated audit table in the existing PostgreSQL database, written through the existing `pg` driver, **not** on the `account-<id>` stream | The docs recommend keeping audit off the account stream. A table can be queried by staff, case or account, and can support deletion or anonymization if legal requires it, which an append-only stream cannot. | **Separate Ocoda stream:** immutable, conflicts with possible deletion (`spec.md:211`), hard to query across streams. **External log service:** none documented. | Docs for "outside the account stream"; the table choice is mine | **Authorized technical lead and security reviewer.** Stays **blocked** until both are identified and approval is recorded. The lead also confirms this is not a "competing event store" under `CLAUDE.md`. | ______ |
| W2 | Schema and minimum fields | One row per attempt: `id`, `occurred_at`, `actor_type` (customer or support), `actor_id`, `account_id`, `action`, `outcome` (success, denied or rejected), `reason_code`, `query` (JSON of `operationId`, `from`, `to`, page size, cursor), `case_id`, `note`, `result_count` | Covers the documented minimum set. `outcome` and `reason_code` are needed to record denied and rejected attempts. | None; the alternative is leaving it OPEN. | Field set is docs (B4, Q2.2, Q2.3). `outcome`, `reason_code` and layout are mine. | Security reviewer and authorized technical lead | ______ |
| W3 | Fail-closed and write timing | Fail closed. Read, write the audit row synchronously, and return data only if the write succeeds. On failure, return an error and no data. | The docs recommend fail closed with the audit written before the response. Only a synchronous write can block a read. | **Fail open:** disclosures can go unrecorded. **Async outbox:** cannot block a read unless the enqueue is synchronous and durable. | Docs | Security reviewer, client compliance, authorized technical lead | ______ |
| W4 | Audit scope details | Audit empty results (`result_count` 0). Do not audit rejected customer requests in the first release. No rate limit now; schedule a volume review. | Empty results use the same path at no extra cost. Rejected customer requests are not required and raise abuse volume. | **Audit rejected customer requests now:** not decided by the client. | Mine; all three are OPEN in the docs | Security reviewer | ______ |
| W5 | Who can read audit records | A separate read-only auditor role, distinct from the SEC-01 internal role, behind the SEC-01 guard | Reading who looked at which account is a different duty from reading raw event history. TC-WH04-008 already expects a non-auditor to be refused. | **Same role as raw event history:** simpler, but one role holds both capabilities. **Database-only access:** not a managed control. | Mine; OPEN in the docs | Security reviewer and client | ______ |
| W6 | Retention | Build no deletion or retention job yet. Keep `occurred_at` so one can be added later. Transaction history stays on the PROVISIONAL lifetime rule. | Retention is a legal question. Building deletion on a guess risks breaking a legal requirement. | **Fix a period now:** invents a policy. | Docs; OPEN pending compliance (B5) | **Client compliance and legal.** No contact is named in the docs. | ______ |
| W7 | Error code name for audit-write failure | `AUDIT_UNAVAILABLE`, added to `DomainErrorCode` | Stable code following `CLAUDE.md`; it is a public API contract. | **Reuse a generic 500:** hides the cause and gives callers no stable code. | Mine, recommendation only | Authorized technical lead and security reviewer | ______ |
| W8 | HTTP status for audit-write failure | `503 Service Unavailable`, mapped only in `DomainExceptionFilter` | The service cannot complete the read while the audit store is down, and the condition may clear. | **500:** suggests a bug rather than a dependency outage. | Mine, recommendation only | Authorized technical lead and security reviewer | ______ |

## Questions for legal and compliance (W6)
1. The minimum and maximum retention period for audit records and for transaction history.
2. Whether audit records may be deleted, archived or anonymized afterward.
3. Whether staff IDs, customer IDs and free-text notes count as personal data, and what that implies.
4. Whether any applicable rule overrides the lifetime-of-account rule.

## Implementation outline (starts only after W1 to W8 are approved and SEC-01 is merged)
- New `src/audit/` module with a writer and a reader. Table created next to `EventStoreInitializer`, since no migration tooling exists.
- Add the W7 code and the W8 mapping to `domain-errors.ts` and `domain-exception.filter.ts`, together.
- Audit calls around the WH-01, WH-02 and WH-03 handlers. These are not exposed today, so they are tested at handler level.
- Update `docker/init-test-db.sql` and `test/accounts.e2e-spec.ts` for the new table.

## Tests mapped to acceptance criteria

| Criterion | Tests |
|---|---|
| Each WH-02 and WH-03 lookup produces one audit record | TC-WH04-001, TC-WH04-002 |
| Each WH-01 customer page produces one audit record | TC-WH04-003 |
| Denied access and rejected support lookups audited | TC-WH04-009, TC-WH04-010 |
| Failed audit write blocks the read, customer and support | TC-WH04-004 for WH-01, WH-02 and WH-03, asserting `AUDIT_UNAVAILABLE` and 503 once approved |
| Not stored on `account-<id>` | TC-WH04-007 |
| Fields match the minimum set | TC-WH04-005, TC-WH04-006 (needs SEC-01 identity) |
| Audit read access restricted | TC-WH04-008 |
| Empty-result auditing | TC-WH04-011 |

## Verification
`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e` because persistence is involved.

## Blockers
1. SEC-01 merged, for caller identity.
2. Named security reviewer, authorized technical lead, and review date.
3. W1 to W8 approved, each with an approver and a date.
4. Legal and compliance answers to the W6 questions before any production use.
5. Release stays blocked until the security review of storage, schema, readers and fail-closed behavior is complete.
