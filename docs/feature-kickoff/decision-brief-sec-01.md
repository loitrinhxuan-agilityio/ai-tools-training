# SEC-01 decision brief

**Status:** APPROVED for all five decisions (S1 to S5), as recorded below. Review date set to 2026-10-29 by the project lead. Implementation of SEC-01 stays blocked until SEC-01 is implemented and signed off. Follow-up resolutions: R1, R3 and R5 are approved by Loi Trinh (security reviewer), 2026-10-29. R6 is approved by John (authorized technical lead), 2026-10-29. R2 and R4 are approved by John (authorized technical lead) and Loi Trinh (security reviewer), 2026-10-29. The existing approvals above are unchanged. Issue #13, `release-blocked`, `needs-security-review`.
**Scope:** authentication on all six routes, `GET /accounts/:id/events` limited to an internal role, and updated tests.
**Simulated client input:** `updated-open-questions.md` (2c items 3 and 4). It is not real approval.
**Review date:** 2026-10-29, set by the project lead.

## Decisions

### S1. Authentication mechanism
- **Recommendation:** JWT bearer authentication, enforced by one global NestJS guard registered as `APP_GUARD`, so new routes are protected by default.
- **Subject to approval of:** token issuance (who mints tokens, and whether issuance is in or out of SEC-01 scope) and signing-key management (algorithm, key storage, rotation).
- **Required approver:** security reviewer, with the authorized technical lead.
- **Status:** Approved. Security reviewer: Loi Trinh, 2026-10-29. Authorized technical lead: John, 2026-10-29. Design approved by Loi Trinh (security reviewer), 2026-10-29: issuance out of scope, HS256 with `JWT_SECRET`, 15-minute lifetime, `sub` and `role` claims. Design co-approved by John (authorized technical lead), 2026-10-29, as proposed.

### S2. Role for raw event history
- **Recommendation:** one narrowly scoped internal role that grants access to `GET /accounts/:id/events` and nothing else. The other five routes require authentication only.
- **Left open for the security reviewer:** the exact role name and the assignment policy (who may hold it, how it is granted and revoked). These details are not yet part of the approval.
- **Related:** the WH-04 audit-reader role is a separate decision (WH-04 brief, W5).
- **Required approver:** security reviewer.
- **Role name (history):** `internal-event-reader` was approved under S2 by Loi Trinh (security reviewer), 2026-10-29. That name is superseded by `INTERNAL_SUPPORT` (R1). The current approved role is `INTERNAL_SUPPORT`.
- **Assignment policy:** still to be decided by the security reviewer.
- **Status:** Approved (Loi Trinh, security reviewer, 2026-10-29) for the role name. The assignment policy is still open.

### S3. HTTP status policy for refusals
- **Recommendation:** 401 for a missing or invalid credential, 403 for a valid credential without the required permission.
- **Required approver:** authorized technical lead and security reviewer.
- **Status:** Approved. Security reviewer: Loi Trinh, 2026-10-29. Authorized technical lead: John, 2026-10-29.

### S4. New dependency `@nestjs/jwt`
- **Request:** explicit approval to add `@nestjs/jwt` at an exact pinned version (no caret range). `CLAUDE.md` requires approval for any new dependency.
- **Compatibility checked read-only against the npm registry:** latest is `12.0.3`, and its peer range includes `@nestjs/common` `^12.0.0`, matching this repo's `^12.0.1`. The approver should confirm the exact version at approval time, including a check of its own dependencies and licence.
- **Alternatives if rejected:** a custom guard with configured tokens (internal demos only, not a real release).
- **Required approver:** repository owner or designated technical lead.
- **Status:** Approved. Repository owner: David, 2026-10-29, at `@nestjs/jwt` 12.0.3. The security reviewer and the authorized technical lead could not approve this decision on their own.
- **Dependency and licence review (recorded after installation):** the package was installed before this review, so the S4 condition to check "before installing" was not met. Review results: `@nestjs/jwt` 12.0.3 is MIT and depends on `jsonwebtoken` 9.0.3 (MIT) and `@types/jsonwebtoken` 9.0.10 (MIT). The lockfile change adds 15 packages: MIT (11), Apache-2.0 (`ecdsa-sig-formatter` 1.0.11), and BSD-3-Clause (`buffer-equal-constant-time` 1.0.1). Sign-off of this review by David is still open.

### S5. Error codes and mapping
- **Recommendation:** add `UNAUTHENTICATED` mapped to 401 and `FORBIDDEN` mapped to 403 in `DomainErrorCode` and `STATUS_BY_CODE`, edited together, mapped only in `DomainExceptionFilter`.
- **Required approver:** authorized technical lead and security reviewer.
- **Status:** Approved. Security reviewer: Loi Trinh, 2026-10-29. Authorized technical lead: John, 2026-10-29.

**Fallback if S4 is rejected:** a custom guard that maps each configured token to a caller ID and a role. It needs no dependency and is for internal demos only, not a real release.

**Boundary:** account ownership and customer/support authentication (B1, B2) stay BLOCKED. Ownership denials keep the same not-found as unknown accounts (round 1 P3).

### Remaining questions
1. **Token issuance (S1): approved** by Loi Trinh, security reviewer, 2026-10-29. Issuance is out of SEC-01 scope. Tests mint tokens with a test-only key. Co-approved by John (authorized technical lead), 2026-10-29, as proposed.
2. **Signing (S1): approved** by Loi Trinh, security reviewer, 2026-10-29. HS256, with the secret read from the `JWT_SECRET` environment variable (name only; the value is never committed). Token lifetime 15 minutes. Rotation is manual for now. Co-approved by John (authorized technical lead), 2026-10-29, as proposed.
3. **Claims (S1/S2): approved** by Loi Trinh, security reviewer, 2026-10-29. `sub` carries the caller ID and `role` carries the internal role. The guard checks `iss`, `aud` and `exp`. The role name itself is still open (see question 5). WH-04 audit uses `sub` as the caller ID. Note: the current guard does not yet require `exp`, `sub` or `role`; see R2.
4. **Revocation (S1):** is token revocation required, or is a short lifetime enough? Proposed resolution: no revocation list; see R3.
5. **Role (S2, R1):** the current approved role is `INTERNAL_SUPPORT` (R1, Loi Trinh, security reviewer, 2026-10-29). The earlier S2 name `internal-event-reader` is superseded. Assignment policy still open.
6. **Other routes (S2):** confirm the five other routes need authentication only, with no role. Proposed resolution: see R5.
7. **401 details (S3):** should a 401 include a `WWW-Authenticate` header? Proposed resolution: yes, with a Bearer challenge and no detailed errors; see R4.
8. **Ownership (S3):** confirm ownership denials stay a not-found response (round 1 P3) and are out of SEC-01 scope.
9. **Dependency (S4):** resolved. David (repository owner) approved `@nestjs/jwt` 12.0.3. Confirm the package's own dependencies and licence before installing.
10. **Test credentials (S5 and tests):** how do tests obtain valid and invalid tokens without committing secrets? Proposed resolution: test-only secret, see R6.
11. **Review date:** set to 2026-10-29 by the project lead.

## Follow-up resolutions (PROPOSED, not approved)

Each resolution below is a proposal. Nothing here is approved, and no approver, date or decision is recorded.

**R1. Internal role.**
- Proposed: role `INTERNAL_SUPPORT`, required only for `GET /accounts/:id/events`.
- Assignment and revocation are controlled by a trusted operational process. That process is not defined and has no named owner. Role management is **not** implemented in SEC-01.
- Resolved: the rename is approved (R1, 2026-10-29) and implemented. `INTERNAL_SUPPORT_ROLE` in `src/auth/roles.ts` replaces the S2 name `internal-event-reader`.
- Risk to review: "support" may suggest broader access than raw event history.
- Approver: security reviewer. Status: APPROVED by Loi Trinh (security reviewer), 2026-10-29, as proposed. The rename to `INTERNAL_SUPPORT` is made in code (`INTERNAL_SUPPORT_ROLE` in `src/auth/roles.ts`), replacing the earlier name `internal-event-reader` approved under S2.

**R2. JWT validation.**
- Proposed: HS256 only. Require and validate the signature, `iss`, `aud` and `exp`. Require a non-empty `sub` and a valid `role` claim. Role set: the allow-list is `INTERNAL_SUPPORT` only, chosen by the requester (option 1) on 2026-10-29. Any other role is refused as `invalid_token`. The security reviewer's approval of this allow-list is still to be recorded.
- Issuer `banking-event-sourcing` and audience `banking-event-sourcing-api` are implementer defaults, **not confirmed**. No trusted issuer exists to confirm them against.
- Implemented: HS256 only; signature, `iss`, `aud`, `exp`, `sub`, `role` and `iat` are all required, and the role must be on the allow-list. A token issued more than 60 seconds in the future is refused. Errors other than token refusals are rethrown as server faults, not reported as 401s. Issuer and audience values are still unconfirmed.
- Approver: security reviewer with the authorized technical lead. Status: APPROVED by John (authorized technical lead) and Loi Trinh (security reviewer), 2026-10-29. Implemented in the SEC-01 worktree (uncommitted).

**R3. Revocation.**
- Proposed: no per-token revocation list in SEC-01. Keep the 15-minute maximum lifetime, enforced when verifying (a `maxAge` check), not only when signing. Implemented: `maxAge` of 15 minutes on every request, so a token with a far-future `exp` is still refused once its `iat` is older than 15 minutes.
- Residual risk: a stolen or no-longer-entitled token stays valid until it expires, up to 15 minutes.
- Key rotation is manual: change `JWT_SECRET` and restart the app. Every outstanding token becomes invalid at once, and there is no overlap period or key ID.
- Approver: security reviewer. Status: APPROVED by Loi Trinh (security reviewer), 2026-10-29, as proposed.

**R4. WWW-Authenticate.**
- Proposed: every 401 includes `WWW-Authenticate: Bearer realm="banking-event-sourcing"` (RFC 6750). With no credentials, no `error` attribute. With a presented but invalid token, `error="invalid_token"` only, with no `error_description`, so expiry, signature, issuer and audience failures look identical. 403 stays unchanged.
- Implemented: `UnauthenticatedError` carries whether a token was presented (`invalidToken`). The exception filter builds `WWW-Authenticate` from that flag. The response body does not change.
- Approver: authorized technical lead and security reviewer. Status: APPROVED by John (authorized technical lead) and Loi Trinh (security reviewer), 2026-10-29. Implemented in the SEC-01 worktree (uncommitted).

**R5. Route access.**
- Proposed (matches current code): all six routes require authentication. Only `GET /accounts/:id/events` also requires the internal role. Account ownership and customer/support authentication stay out of scope (B1, B2).
- Approver: security reviewer. Status: APPROVED by Loi Trinh (security reviewer), 2026-10-29, as proposed.

**R6. Tests.**
- Proposed: tokens minted with a test-only secret; tests for invalid signature, expiry, issuer, audience, required claims, roles, the Bearer challenge header, and no side effects from refused writes.
- Covered today: signature, expiry, audience, role, and a refused deposit leaving the account unchanged. Issuer is covered in the guard unit test only.
- Missing: required-claim cases (no `exp`, no `sub`, empty `sub`, no `role`), the 401 header, issuer over HTTP, refused withdrawal and refused account creation side-effect checks, and a wrong-algorithm token.
- Approver: authorized technical lead. Status: APPROVED by John (authorized technical lead), 2026-10-29, as proposed. Implemented in the SEC-01 worktree (uncommitted): required-claim, issuer, audience, algorithm, age and side-effect tests, the `WWW-Authenticate` header tests, the 403 header check at filter level, and the production startup tests.

### Approval checklist
Blank fields are for the authorized person to complete. Only the sign-offs recorded above are filled in.

| Decision | Required approver (role) | Approver identity | Date | Decision (Approve / Approve with changes / Reject) | Conditions or notes |
|---|---|---|---|---|---|
| S1 JWT bearer with global guard, subject to issuance and key management | Security reviewer, with authorized technical lead | Security reviewer: Loi Trinh. Technical lead: John | Security: 2026-10-29. Technical lead: 2026-10-29 | Security: Approve. Technical lead: Approve | Design approved by Loi Trinh (security reviewer), 2026-10-29: issuance out of scope, HS256 with `JWT_SECRET`, 15-minute lifetime, `sub` and `role` claims. Design co-approved by John (authorized technical lead), 2026-10-29, as proposed. |
| S2 One narrow internal role for raw event history; name and assignment open | Security reviewer | Loi Trinh (security reviewer) | 2026-10-29 | Approve | Exact role name and assignment policy still open. |
| S3 401 for missing/invalid credentials, 403 for insufficient permission | Authorized technical lead and security reviewer | Security reviewer: Loi Trinh. Technical lead: John | Security: 2026-10-29. Technical lead: 2026-10-29 | Security: Approve. Technical lead: Approve | None. |
| S4 `@nestjs/jwt` at a pinned compatible version | Repository owner or designated technical lead | David (repository owner) | 2026-10-29 | Approve | Version 12.0.3. Confirm its dependencies and licence before installing. |
| S5 `UNAUTHENTICATED` to 401, `FORBIDDEN` to 403 | Authorized technical lead and security reviewer | Security reviewer: Loi Trinh. Technical lead: John | Security: 2026-10-29. Technical lead: 2026-10-29 | Security: Approve. Technical lead: Approve | None. |
| R1 `INTERNAL_SUPPORT` role (proposed rename) | Security reviewer | Loi Trinh (security reviewer) | 2026-10-29 | Approve (as proposed) | Rename made in code; replaces `internal-event-reader`. Assignment process unowned. |
| R2 JWT validation rules and issuer/audience values | Security reviewer, with authorized technical lead | Security reviewer: Loi Trinh. Technical lead: John | Security: 2026-10-29. Technical lead: 2026-10-29 | Security: Approve. Technical lead: Approve | Issuer and audience unconfirmed; no trusted issuer exists. |
| R3 No revocation list; manual key rotation; residual risk | Security reviewer | Loi Trinh (security reviewer) | 2026-10-29 | Approve (as proposed) | Up to 15 minutes residual exposure. |
| R4 `WWW-Authenticate` Bearer challenge on 401 | Authorized technical lead and security reviewer | Security reviewer: Loi Trinh. Technical lead: John | Security: 2026-10-29. Technical lead: 2026-10-29 | Security: Approve. Technical lead: Approve | Implemented (uncommitted). |
| R5 Route access (six routes authenticated; `/events` role-restricted) | Security reviewer | Loi Trinh (security reviewer) | 2026-10-29 | Approve (as proposed) | Matches current code. |
| R6 Test coverage and test-only secret | Authorized technical lead | John (authorized technical lead) | 2026-10-29 | Approve (as proposed) | Implemented (uncommitted). |

**Boundary:** account ownership and customer/support authentication (B1, B2) stay BLOCKED.

## Implementation outline (starts only after S1 to S5 are approved)
- New `src/auth/` module with the guard and a role decorator; register the guard globally in `src/app.module.ts`.
- Role decorator on `getEvents` in `accounts.controller.ts`.
- Add the S5 codes to `src/shared/domain-errors.ts` and `domain-exception.filter.ts`, together.
- Auth config key names in `src/config/env.ts` and `.env.example` (names only, no values).
- Update `src/accounts/accounts.http.spec.ts` to authenticate through one shared helper.
- Tests mint tokens from a test-only key (depends on question 1).

## Tests mapped to acceptance criteria

| Criterion | Tests |
|---|---|
| Unauthenticated request to any route refused | TC-SEC-001 (three write routes, no event appended), TC-SEC-002 (two read routes), plus **a new case** for unauthenticated `GET /accounts/:id/events` |
| `/events` refused without the internal role | TC-SEC-003, plus wrong-role and malformed-token negatives |
| Existing HTTP tests authenticate and pass | The whole `accounts.http.spec.ts` suite |
| TC-REG-008 updated | TC-REG-008 with the internal role |
| Suggested extra | A test that fails if any controller route lacks the guard |

## Verification
`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; `npm run test:e2e` only if the e2e bootstrap changes.

## Blockers
1. **Production token issuance:** no trusted issuer exists. Real release is blocked until one is chosen and its issuer and audience values are confirmed.
2. **Role assignment and revocation process:** the rename to `INTERNAL_SUPPORT` is approved and implemented (R1). Assignment and revocation are not defined, and no owner is named.
3. **Issuer and audience values:** unconfirmed.
4. **Implementation:** R2, R3, R4 and R6 are implemented in the worktree, with the allow-list, `alg: none`, the 403 header check, and the account-opening store check. The code review fixes are in: the test key and low-variety secrets are refused at startup; the test helper is in `test/support` and excluded from the build; the production startup path is tested; non-token errors are rethrown; future `iat` is refused; the error carries a flag instead of HTTP text. Checks pass: 276 unit tests, 11 e2e tests, typecheck, lint and build. Nothing is committed. Account-opening check: verified by counting events in the store (HTTP `readAll`, e2e `events` table), with no production endpoint added.
5. **Approvals:** R1 to R6 are approved (see the checklist). Issuer and audience values still need confirmation (blocker 3).
6. **Key management:** who provisions and rotates `JWT_SECRET` is undefined.
7. **Test matrix:** `test-matrix.md` still marks the TC-SEC cases BLOCKED.
8. **Known limits:** a misconfigured secret inside the JWT library still returns 401. The startup check refuses a missing secret, which is the real guard against that case. The test-key denylist in `src/config/env.ts` repeats the test key literal, so the two must change together.
9. Release stays blocked until SEC-01 is committed, reviewed and signed off.
