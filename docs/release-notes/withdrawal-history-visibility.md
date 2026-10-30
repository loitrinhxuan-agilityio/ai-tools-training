# Release Notes: Withdrawal History & Visibility

**Release type:** Foundation release (pre-production)
**Status:** Not approved for production use. See [Limitations and Prerequisites](#5-limitations-and-prerequisites).

## 1. Overview

Withdrawal History & Visibility gives customers a clear record of their successful withdrawals and gives support staff a safe, accountable way to investigate them. It is built around three ideas: easy-to-read history, controlled access, and a trustworthy record of who looked at what.

**What is available now.** This release delivers the groundwork. The access controls are in force today. The withdrawal history and lookup capabilities are built and tested, but they are **not yet switched on**: no customer or support user can reach them until a later release connects them to the service.

| Capability | Availability in this release |
|---|---|
| Sign-in required on all account routes; raw account history limited to internal support | **Active** |
| Withdrawal History (customers) | Built, not yet available |
| Individual Withdrawal Lookup (support) | Built, not yet available |
| Date-Range Withdrawal Search (support) | Built, not yet available |
| Audited lookups with fail-closed protection (support) | Built, takes effect when support lookups are switched on |

## 2. New Features

### Withdrawal History

**What it does.** Lists an account's successful withdrawals, newest first, one page at a time. Each entry shows the withdrawal's reference, amount, date and time, and a "succeeded" status. Results can be narrowed by date range. Failed attempts and resulting balances are not included.

**Status.** Built and tested internally. It is not yet available to customers: it has no customer-facing access point, and customer sign-in and account ownership checks are not in place.

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

### Audited History Lookups

Each support lookup attempt is recorded, whether it succeeds or is rejected. A record shows who made the request, which account, what was searched, the case reference and note supplied, the time, and how many results were returned. Audit records are stored separately from customers' financial records.

This takes effect when support lookups are switched on. Customer-side history requests are not audited in this release.

### Fail-Closed Protection

If a lookup cannot be recorded, it returns no data and reports that the service is temporarily unavailable. A support lookup is therefore never answered without an audit record.

In rare timeout cases, a record may exist for a request that received an "unavailable" response. The audit trail may therefore over-record a request, but it will not omit one.

## 4. Customer Benefits

Once the lookup capabilities are switched on, this feature provides:

- **Transparency.** Customers can see their successful withdrawals in one place.
- **Faster support.** Support staff can locate a specific withdrawal or review a period directly.
- **Traceability.** Every support lookup is tied to a named staff member and a case reference.
- **Protection against unrecorded access.** If the audit record cannot be written, the data is not released.
- **Tighter access control.** Account routes now require sign-in, and the most sensitive history is limited to internal support.

## 5. Limitations and Prerequisites

This release is **not approved for production use**. No deployment or production-readiness evidence exists in the repository.

**Prerequisites before the lookups can be enabled:**

- **Access points.** The customer history and support lookups need to be connected to the service. None are connected yet.
- **Trusted token issuer.** No issuer exists to create sign-in tokens. This is unresolved.
- **Signing-key ownership.** No owner is named for the key that signs tokens. Key rotation is manual and would sign out all users at once. This is unresolved.
- **Token identity values.** The issuer and audience values used to validate tokens are not yet confirmed.
- **Customer sign-in and account ownership.** Customers cannot yet sign in, and there is no check that a customer is viewing only their own accounts.
- **Case reference checks.** Support lookups accept a case reference, but its format is not yet validated.
- **Audit coverage gaps.** Refused access (such as a caller without the support role) is not yet recorded. Customer-side audit and a role for reading audit records are not built. The audit retention period awaits legal and compliance guidance.
- **Audit storage permissions.** Making audit records append-only at the database level depends on the production database role, which is not yet confirmed.

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

All five pull requests are merged. The issues remain open because each still has release-blocking work.
