# SEC-01 decision brief

**Status:** DRAFT. Recommendations only; nothing here is approved. Issue #13, `release-blocked`, `needs-security-review`.
**Scope:** authentication on all six routes, `GET /accounts/:id/events` limited to an internal role, and updated tests.
**Simulated client input:** `updated-open-questions.md` (2c items 3 and 4). It is not real approval.
**People not yet identified (names left open, none invented):** security reviewer, authorized technical lead, repository owner or designated technical lead for dependencies. The project lead is asked to name them, and the review date is also open.

## Decisions

| # | Decision | Recommended pick | Why | Alternatives not picked | Source | Decision-maker | Approved by / date |
|---|---|---|---|---|---|---|---|
| S1 | Authentication mechanism | Signed JWT bearer token checked by one global guard registered as `APP_GUARD` | The token carries who the caller is and their role. WH-04 needs the caller identity (TC-WH04-006) and `/events` needs a role. A global guard protects new routes by default. | **Static API key:** no identity or role per person. **Passport strategies:** more dependencies for the same result. **Gateway or identity provider:** none documented. | Mine. The docs say only "mechanism OPEN". | Security reviewer, with the authorized technical lead | ______ |
| S2 | Role model and name | One role for both internal and security staff. The name is for the reviewer to supply. | The docs say "authorized internal or security role". The audit reader gets a separate role (WH-04 W5). | **Two roles each allowed:** more to maintain, no documented need. | Mine. No role name exists in the docs. | Security reviewer | ______ |
| S3 | HTTP status policy for refusals | 401 for a missing or invalid credential, 403 for the wrong role | Conventional split, and it gives TC-SEC-003 a distinct case. | **Single 403 for both:** reveals less but loses the distinction. | Mine. The docs say only "401 or 403". | Authorized technical lead and security reviewer | ______ |
| S4 | New dependency | Approve one package, `@nestjs/jwt`, at a pinned version. No Passport. | The smallest addition that supports S1. | **No dependency:** hand-written token checking would be a security risk. | Mine. `CLAUDE.md` requires approval for any dependency. | **Repository owner or designated technical lead.** The docs name no one, so the approver is **open**; the project lead is asked to name them. | ______ |
| S5 | Error code names and mapping | Add `UNAUTHENTICATED` (401) and `FORBIDDEN` (403) to `DomainErrorCode`, mapped only in `DomainExceptionFilter`'s `STATUS_BY_CODE`, edited together | Stable codes follow the `CLAUDE.md` rule. They are a public API contract, so they are approved separately from S3. | **Nest built-in exceptions:** responses would have no `code` field. | Mine | Authorized technical lead and security reviewer | ______ |

**Fallback if S4 is rejected:** a custom guard that maps each configured token to a caller ID and a role. It needs no dependency and is for internal demos only, not a real release.

**Boundary:** account ownership and customer/support authentication (B1, B2) stay BLOCKED. Ownership denials keep the same not-found as unknown accounts (round 1 P3).

## Implementation outline (starts only after S1 to S5 are approved)
- New `src/auth/` module with the guard and a role decorator; register the guard globally in `src/app.module.ts`.
- Role decorator on `getEvents` in `accounts.controller.ts`.
- Add the S5 codes to `src/shared/domain-errors.ts` and `domain-exception.filter.ts`, together.
- Auth config key names in `src/config/env.ts` and `.env.example` (names only, no values).
- Update `src/accounts/accounts.http.spec.ts` to authenticate through one shared helper.

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
1. Named security reviewer, authorized technical lead, dependency approver, and review date.
2. S1 to S5 approved, each with an approver and a date.
3. Release stays blocked until SEC-01 is implemented, reviewed and signed off.
