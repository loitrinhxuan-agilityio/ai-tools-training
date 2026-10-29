# SEC-01 decision brief

**Status:** APPROVED for all five decisions (S1 to S5), as recorded below. Review date set to 2026-10-29 by the project lead. Implementation of SEC-01 stays blocked until SEC-01 is implemented and signed off. Issue #13, `release-blocked`, `needs-security-review`.
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
- **Status:** Approved (Loi Trinh, security reviewer, 2026-10-29). The exact role name and assignment policy are still to be decided.

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

### S5. Error codes and mapping
- **Recommendation:** add `UNAUTHENTICATED` mapped to 401 and `FORBIDDEN` mapped to 403 in `DomainErrorCode` and `STATUS_BY_CODE`, edited together, mapped only in `DomainExceptionFilter`.
- **Required approver:** authorized technical lead and security reviewer.
- **Status:** Approved. Security reviewer: Loi Trinh, 2026-10-29. Authorized technical lead: John, 2026-10-29.

**Fallback if S4 is rejected:** a custom guard that maps each configured token to a caller ID and a role. It needs no dependency and is for internal demos only, not a real release.

**Boundary:** account ownership and customer/support authentication (B1, B2) stay BLOCKED. Ownership denials keep the same not-found as unknown accounts (round 1 P3).

### Remaining questions
1. **Token issuance (S1): approved** by Loi Trinh, security reviewer, 2026-10-29. Issuance is out of SEC-01 scope. Tests mint tokens with a test-only key. Co-approved by John (authorized technical lead), 2026-10-29, as proposed.
2. **Signing (S1): approved** by Loi Trinh, security reviewer, 2026-10-29. HS256, with the secret read from the `JWT_SECRET` environment variable (name only; the value is never committed). Token lifetime 15 minutes. Rotation is manual for now. Co-approved by John (authorized technical lead), 2026-10-29, as proposed.
3. **Claims (S1/S2): approved** by Loi Trinh, security reviewer, 2026-10-29. `sub` carries the caller ID and `role` carries the internal role. The guard checks `iss`, `aud` and `exp`. The role name itself is still open (see question 5). WH-04 audit uses `sub` as the caller ID.
4. **Revocation (S1):** is token revocation required, or is a short lifetime enough?
5. **Role (S2):** exact role name, and the assignment policy.
6. **Other routes (S2):** confirm the five other routes need authentication only, with no role.
7. **401 details (S3):** should a 401 include a `WWW-Authenticate` header?
8. **Ownership (S3):** confirm ownership denials stay a not-found response (round 1 P3) and are out of SEC-01 scope.
9. **Dependency (S4):** resolved. David (repository owner) approved `@nestjs/jwt` 12.0.3. Confirm the package's own dependencies and licence before installing.
10. **Test credentials (S5 and tests):** how do tests obtain valid and invalid tokens without committing secrets?
11. **Review date:** set to 2026-10-29 by the project lead.

### Approval checklist
Blank fields are for the authorized person to complete. Only the sign-offs recorded above are filled in.

| Decision | Required approver (role) | Approver identity | Date | Decision (Approve / Approve with changes / Reject) | Conditions or notes |
|---|---|---|---|---|---|
| S1 JWT bearer with global guard, subject to issuance and key management | Security reviewer, with authorized technical lead | Security reviewer: Loi Trinh. Technical lead: John | Security: 2026-10-29. Technical lead: 2026-10-29 | Security: Approve. Technical lead: Approve | Design approved by Loi Trinh (security reviewer), 2026-10-29: issuance out of scope, HS256 with `JWT_SECRET`, 15-minute lifetime, `sub` and `role` claims. Design co-approved by John (authorized technical lead), 2026-10-29, as proposed. |
| S2 One narrow internal role for raw event history; name and assignment open | Security reviewer | Loi Trinh (security reviewer) | 2026-10-29 | Approve | Exact role name and assignment policy still open. |
| S3 401 for missing/invalid credentials, 403 for insufficient permission | Authorized technical lead and security reviewer | Security reviewer: Loi Trinh. Technical lead: John | Security: 2026-10-29. Technical lead: 2026-10-29 | Security: Approve. Technical lead: Approve | None. |
| S4 `@nestjs/jwt` at a pinned compatible version | Repository owner or designated technical lead | David (repository owner) | 2026-10-29 | Approve | Version 12.0.3. Confirm its dependencies and licence before installing. |
| S5 `UNAUTHENTICATED` to 401, `FORBIDDEN` to 403 | Authorized technical lead and security reviewer | Security reviewer: Loi Trinh. Technical lead: John | Security: 2026-10-29. Technical lead: 2026-10-29 | Security: Approve. Technical lead: Approve | None. |

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
1. Release stays blocked until SEC-01 is implemented, reviewed and signed off.
