# Release 0.1.0 — Withdrawal History & Visibility — 2026-11-03

**Status:** DRAFT — for release owner review. Not an approval.
**Version:** 0.1.0 (PROPOSED: the feature adds new capabilities, so a minor bump from `0.0.1`)

---

# Part A — Release notes

**Release type:** Foundation release (pre-production)
**Status:** Not approved for production use. See [Limitations and Prerequisites](#5-limitations-and-prerequisites).

## 1. Overview

Withdrawal History & Visibility gives customers a clear record of their successful withdrawals and gives support staff a safe, accountable way to investigate them. It is built around three ideas: easy-to-read history, controlled access, and a trustworthy record of who looked at what.

**What is available now.** This release delivers the groundwork. The access controls are in force today. The withdrawal history and lookup capabilities are built and tested, but they are **not yet switched on**: they are not connected to the service at all, so no customer or support user can reach them until a later release connects them.

| Capability | Availability in this release |
|---|---|
| Sign-in required on all account routes; raw account history limited to internal support | **Active** |
| Withdrawal History (customers) | Built, not yet available |
| Individual Withdrawal Lookup (support) | Built, not yet available |
| Date-Range Withdrawal Search (support) | Built, not yet available |
| Audited lookups with fail-closed protection (support) | Takes effect when support lookups are switched on |

## 2. New Features

### Withdrawal History

**What it does.** Lists an account's successful withdrawals, newest first, one page at a time. Each entry shows the withdrawal's reference, amount, and date and time. Only successful withdrawals are listed; a visible "succeeded" status on each entry is part of the agreed design but is not yet in the built version. Results can be narrowed by date range. Failed attempts and resulting balances are not included.

**Status.** Built and tested internally. It is not yet available to customers: it is not connected to the service, and customer sign-in and account ownership checks are not in place.

### Individual Withdrawal Lookup

**What it does.** Lets authorized support staff find a single withdrawal on an account using its reference. If no successful withdrawal matches, the lookup reports "not found".

**Status.** Internal support capability. Built and tested, not yet reachable by support staff.

### Date-Range Withdrawal Search

**What it does.** Lets authorized support staff list an account's successful withdrawals within a date range, with page-size control. Invalid requests are rejected before any account data is read, including reversed ranges, malformed dates and future dates.

**Status.** Internal support capability. Built and tested, not yet reachable by support staff.

## 3. Security and Auditability

### Authentication and Role-Based Authorization

**Active now.** Every existing account route requires a valid sign-in token. Tokens are short-lived (15 minutes). Requests with a missing, expired or invalid token are refused. The raw account event history is restricted to the internal support role. Callers without that role are refused.

Customer sign-in is not yet supported. Only the internal support role is recognized.

**Effect on existing users of the service.** The routes for opening accounts, deposits, withdrawals and viewing an account now refuse every request that lacks a valid token. Because only the internal support role is accepted and nothing yet issues tokens, existing API clients cannot use these routes until a token issuer and customer sign-in are in place.

### Audited History Lookups

Each support lookup that reaches the lookup service is recorded, whether it succeeds or is rejected. A record shows who made the request, which account, what was searched, the case reference and note if one was supplied, the time, and how many results were returned. Audit records are kept in a separate table, apart from the account's transaction history.

This takes effect when support lookups are switched on. Customer-side history requests are not audited in this release.

### Fail-Closed Protection

If a lookup cannot be recorded, it returns no data and reports that the service is temporarily unavailable. A support lookup is therefore never answered without an audit record.

In rare timeout cases, a record may exist for a request that received an "unavailable" response. The audit trail may therefore over-record a request, but it will not omit one.

## 4. Customer Benefits

Once the lookup capabilities are switched on, this feature provides:

- **Transparency.** Customers can see their successful withdrawals in one place.
- **Faster support.** Support staff can locate a specific withdrawal or review a period directly.
- **Traceability.** Every support lookup is tied to the signed-in staff member. A case reference is recorded when one is supplied; it is not yet required.
- **Protection against unrecorded access.** If the audit record cannot be written, the data is not released.
- **Tighter access control.** Account routes now require sign-in, and the most sensitive history is limited to internal support.

## 5. Limitations and Prerequisites

This release is **not approved for production use**. No deployment or production-readiness evidence exists in the repository.

**Prerequisites before the lookups can be enabled:**

- **Access points.** The customer history and support lookups need to be connected to the service. None are connected yet.
- **Trusted token issuer.** No issuer exists to create sign-in tokens. This is unresolved.
- **Signing key.** The service will not start without a signing key of at least 32 characters, and the key must be set in each environment. Rotation is manual and signs out every user at once. No owner for the key is recorded in the repository; this is unresolved.
- **Token identity values.** The issuer and audience values used to validate tokens are not yet confirmed.
- **Customer sign-in and account ownership.** Customers cannot yet sign in, and there is no check that a customer is viewing only their own accounts.
- **Case reference checks.** Support lookups accept a case reference, but its format is not yet validated.
- **Audit coverage gaps.** Refused access (such as a caller without the support role) is not yet recorded. Customer-side audit and a role for reading audit records are not built. The audit retention period awaits legal and compliance guidance.
- **Audit storage permissions.** Making audit records append-only at the database level depends on the production database role, which is not yet confirmed. The service also creates the audit table itself when it starts, and whether production allows that is not yet confirmed.
- **Audit design sign-off.** The audit design decisions (where records are stored, which fields, how failures behave, who can read them, how long they are kept) have no recorded approval in the repository.

**Other constraints:**

- Page-size defaults and some error codes are still proposals.
- Each history read scans the full account history, and its performance at scale has not been measured.
- Only successful withdrawals are shown. Failed attempts are not stored or shown.

## 6. Related Changes

| Area | Pull request | Issue | Issue status |
|---|---|---|---|
| Withdrawal History | [#14](https://github.com/loitrinhxuan-agilityio/ai-tools-training/pull/14) | [#9](https://github.com/loitrinhxuan-agilityio/ai-tools-training/issues/9) | Open |
| Individual Withdrawal Lookup | [#15](https://github.com/loitrinhxuan-agilityio/ai-tools-training/pull/15) | [#10](https://github.com/loitrinhxuan-agilityio/ai-tools-training/issues/10) | Open |
| Date-Range Withdrawal Search | [#16](https://github.com/loitrinhxuan-agilityio/ai-tools-training/pull/16) | [#11](https://github.com/loitrinhxuan-agilityio/ai-tools-training/issues/11) | Open |
| Audit and fail-closed behavior | [#21](https://github.com/loitrinhxuan-agilityio/ai-tools-training/pull/21) | [#12](https://github.com/loitrinhxuan-agilityio/ai-tools-training/issues/12) | Open |
| Authentication and authorization | [#19](https://github.com/loitrinhxuan-agilityio/ai-tools-training/pull/19) | [#13](https://github.com/loitrinhxuan-agilityio/ai-tools-training/issues/13) | Open |

All five pull requests are merged. The issues remain open because each is marked as release-blocked, and four of them (support lookups, audit, and authentication) are also waiting on a security review.

---

# Part B — Internal release ticket (remove before sharing Part A)

**Scope:** WH-01, WH-02, WH-03, WH-04, SEC-01 · PRs #14, #15, #16, #19, #21 (all merged) · issues #9 to #13 (all open)
**Branch:** `docs/release-notes-and-playbook` (main plus two docs commits).

## Availability evidence
| Capability | Status | Evidence (handler → route / module) |
|---|---|---|
| Sign-in on all routes | **Active** | `AuthGuard` registered as `APP_GUARD` in `src/auth/auth.module.ts`; covers all six routes in `src/accounts/api/accounts.controller.ts` (401 asserted for each in `src/accounts/accounts.auth.http.spec.ts`) |
| Raw history limited to internal support | **Active** | `GET :id/events` has `@RequireRole(INTERNAL_SUPPORT_ROLE)` |
| Withdrawal history | **Built, not yet available** | `GetWithdrawalHistoryQuery/Handler` (`get-withdrawal-history.query.ts`): no controller route, not registered in any module |
| Individual lookup | **Built, not yet available** | `GetWithdrawalDetailsQuery/Handler`: no route, not registered |
| Date-range search | **Built, not yet available** | `ListSupportWithdrawalsQuery/Handler`: no route; its comment says "Not registered in any module and not exposed by a route" |
| Audited, fail-closed lookups | **Takes effect when support lookups are switched on** | `SupportLookupAuditor` is called only from the two support handlers above |

The controller has six routes: open account, deposit, withdraw, read deposit, read account state, read events. None dispatches a withdrawal-history query.

## Tickets
| Ticket | PR | Issue (labels) | `tickets.md` release status | Acceptance criteria |
|---|---|---|---|---|
| WH-01 | #14 | #9: `release-blocked`, `needs-decision` | BLOCKED on authentication, ownership, route protection and audit | 16 of 16 unchecked |
| WH-02 | #15 | #10: `release-blocked`, `needs-decision`, `needs-security-review` | BLOCKED on WH-04, support authentication, authorization | 11 of 11 unchecked |
| WH-03 | #16 | #11: `release-blocked`, `needs-decision`, `needs-security-review` | BLOCKED on WH-04, support authentication, authorization | 11 of 11 unchecked |
| WH-04 | #21 | #12: `release-blocked`, `needs-security-review` | OPEN, "Not released" | 7 of 7 unchecked |
| SEC-01 | #19 | #13: `release-blocked`, `needs-security-review` | BLOCKED until the security reviewer designs it (stale: the design is approved, see below) | 3 of 3 unchecked |

No criterion in `tickets.md` has been ticked off, even for built work. Treat the counts as "not recorded as met", not as "known unmet".

## Blockers
- **Issues #9 to #13 are all OPEN with `release-blocked`.** `needs-security-review`: #10, #11, #12, #13. `needs-decision`: #9, #10, #11.
- **WH-04 design approvals are not recorded** (**OPEN**). `docs/feature-kickoff/decision-brief-wh-04.md` is DRAFT ("nothing here is approved"). Its "Approved by / date" cell is blank for each of W1 to W8. Code comments cite "approved W3/W7"; no approval record was found.
- **WH-01 customer release** is **BLOCKED**: customer authentication and account ownership do not exist (`INTERNAL_SUPPORT` is the only recognized role).
- **SEC-01:** decisions S1 to S5 and follow-ups R1 to R6 are recorded as approved (2026-10-29), but the issuer and audience are "implementer defaults, **not confirmed**" (brief, R2), and the sign-off of the `@nestjs/jwt` dependency and licence review is still open (S4). Implementation sign-off is not recorded.
- **Token issuance** is out of scope and has no owner. No signing-key owner is recorded.
- **Other WH-04 items still OPEN:** who may read audit records, retention period, empty-result auditing, audit volume under abuse.

## Risks
| Area | Finding | Files | Mitigation / owner |
|---|---|---|---|
| Auth/security | All six existing routes now refuse callers without a valid bearer token; only `INTERNAL_SUPPORT` tokens are accepted; no issuer exists (only `test/support/test-tokens.ts` mints tokens). Existing clients of open-account, deposit, withdraw and balance routes cannot call them. | `src/auth/auth.guard.ts`, `roles.ts`, `jwt-options.ts` | Release owner to confirm this is intended. Unresolved: who issues tokens. |
| Auth/security | Revocation: a stolen token stays valid up to 15 minutes. Rotating `JWT_SECRET` invalidates all tokens at once (no key ID, no overlap). | SEC-01 brief R3 | Accepted in R3. |
| Auth/security | Audit code on the support lookup path; fail-closed; case reference accepted but not validated. | `src/audit/*`, `src/accounts/application/queries/*` | Security review (#10 to #13) |
| Persistence | `audit_records` is created by the app at startup (`CREATE TABLE IF NOT EXISTS`). Append-only relies on the production DB role holding only INSERT and SELECT; DDL permission in production is unconfirmed. | `src/audit/pg-audit-writer.ts`, `audit-table.initializer.ts` | Release owner / DB owner. Run `npm run test:e2e`. |
| Audit accuracy | A write that times out may still commit: caller gets "unavailable" while the row says success. Audit can over-record, not omit. | `src/audit/support-lookup-auditor.ts` | Documented in Part A; no sign-off found. |
| Config/env | `JWT_SECRET` is required (at least 32 characters; app throws on start if missing). `AUDIT_WRITE_TIMEOUT_MS` optional (default 2000 ms). Names only. | `.env.example`, `src/config/env.ts` | Add to deployment checklist |
| Dependencies | `@nestjs/jwt` 12.0.3 added in #19 (lockfile adds 15 packages). Approved by the repository owner on 2026-10-29 (SEC-01 S4). It was installed before the licence review; review sign-off is still open. | `package.json`, `package-lock.json` | Repository owner |
| Performance | History and lookups read the full account stream; not measured. | `get-withdrawal-history.query.ts` | Measure before enabling |
| Event contracts | None. The five PRs touch no `*.events.ts` and nothing under `src/event-store/`. | — | — |
| Transfers/saga | None. | — | — |

## Claims check
| Claim in Part A | Source | Result |
|---|---|---|
| Sign-in required on all account routes; raw history limited to internal support | `APP_GUARD`; `@RequireRole`; `accounts.auth.http.spec.ts` | Verified (tests not run this session) |
| Tokens last 15 minutes | `JWT_LIFETIME = '15m'`; `maxAge` check (SEC-01 R3) | Verified |
| Only the internal support role is recognized | `RECOGNIZED_ROLES` in `roles.ts` | Verified |
| History, lookup and range search not reachable | No route or module references | Verified |
| History entries show reference, amount, date/time; no status yet | `WithdrawalHistoryItem` fields; status only on `WithdrawalDetailsDto` | Verified |
| Lookup reports "not found" | `WithdrawalNotFoundError` | Verified |
| Range search rejects reversed, malformed, future dates before reading | `ListSupportWithdrawalsHandler.read()` | Verified |
| Support lookups are recorded with who, account, search, case, note, time, count | `SupportLookupAuditor`, `AuditRecord` | Verified |
| Audit stored separately from financial records | Separate `audit_records` table, same database | Verified |
| Failed audit write returns no data and "unavailable" | `AuditUnavailableError` → 503 in `domain-exception.filter.ts` | Verified |
| Timeout can leave a record for an "unavailable" response | Residual-risk comment in `support-lookup-auditor.ts` | Verified |
| Customer-side not audited; refused access not recorded; no audit-reader role | No such code found; `auth.guard.ts` imports show no audit use; not exhaustively searched | Verified by absence (refused-access point partly checked) |
| Case reference format not validated | `caseId` is a nullable string; no validator found | Verified by absence |
| A case reference is recorded when supplied but not required | `SupportAuditContext.caseId` is `string \| null`; the range-search handler comment says the required case ID is blocked | Verified (corrected after the security review: Part A previously said every lookup carries one) |
| Only lookups that reach the lookup service are recorded | A missing audit context throws before any audit write (`get-withdrawal-details.query.ts`); refused access is not recorded | Verified (corrected after the security review) |
| Append-only depends on the production DB role; DDL permission unconfirmed | Comment in `pg-audit-writer.ts` | Verified |
| Page-size defaults and error codes are proposals | PROVISIONAL / OPEN comments in `list-support-withdrawals.query.ts` | Verified |
| Full-stream scan, performance unmeasured | Comment in `get-withdrawal-history.query.ts` | Verified |
| No trusted issuer; issuer/audience values not confirmed | `jwt-options.ts`; SEC-01 brief R2 | Verified |
| Key rotation is manual and signs out everyone at once | SEC-01 brief R3 | Verified |
| No owner for the signing key is recorded | No key-owner statement found in the SEC-01 brief (the only owner named is for the role process and for the dependency) | Verified by absence |
| Audit design decisions have no recorded approval | `decision-brief-wh-04.md`: blank approval cells W1 to W8 | Verified |
| No deployment evidence | `.github/workflows/` has CI and Claude workflows only | Verified |
| PRs merged; issues open; blocking labels | `gh pr view`, `gh issue view`, 2026-11-03 | Verified |

## Verification (actual results only)
- [ ] `npm test` — NOT RUN
- [ ] `npm run typecheck` — NOT RUN
- [ ] `npm run lint` — NOT RUN
- [ ] `npm run build` — NOT RUN
- [ ] `npm run test:e2e` — NOT RUN (required: persistence and audit table)
- [ ] Security review (auth, audit code) — NOT DONE

## Rollout and rollback
- Deploy steps: set `JWT_SECRET` (required); optionally `AUDIT_WRITE_TIMEOUT_MS`. The `audit_records` table is created on first start. No migration of existing events. Withdrawal lookups stay unreachable until a later change connects them.
- Rollback: redeploy the previous build. Keep `audit_records` and its rows. Stored events are never rewritten.

## Go / No-go
- [ ] No unresolved blockers — **currently NO-GO** (see Blockers)
- [ ] All verification checks passed
- [ ] Release owner approval: ______
