# API Reference

**Source:** commit `023da60` on `docs/release-notes-and-playbook` · **Base URL:** `http://localhost:3000` (default port; the `PORT` setting overrides it) · **Generated:** 2026-11-03
**Status:** draft. Derived from the source code and the HTTP test files. Examples are illustrative and nothing was run (no server, no tests).
**Covers:** release 0.1.0 (see `docs/releases/release-0.1.0.md`). Six routes are exposed. The withdrawal history and support lookups are built but have no route (see [Not exposed over HTTP](#not-exposed-over-http)).

## Conventions

- **Authentication:** every route requires `Authorization: Bearer <JWT>`. See [Authentication](#authentication).
- **Money:** integer minor units (for example cents). `1050` means 10.50. No floats. Amounts must be positive safe integers.
- **IDs:** accounts are identified by UUID. A UUID sent in upper case finds the same account; responses return it in lower case (tested).
- **Idempotency:** deposits and withdrawals take a client-supplied `operationId` (1 to 100 characters). Repeating the same request returns `200` with `"status": "duplicate"` and writes nothing. Reusing an `operationId` with a different amount is refused with `409` (tested). The aggregate also refuses reuse with a different operation type (from code only).
- **Business-rule error body:** `{"statusCode": <n>, "code": "<CODE>", "message": "<text>"}`.
- **Validation error body** (request body or path parameters rejected by validation): `{"statusCode": 400, "error": "Bad Request", "message": ["<rule violated>", ...]}`.
- **Unknown request properties are rejected with 400**, not ignored (the global validation pipe sets `forbidNonWhitelisted: true`; tested for deposits).

## Authentication

- **Scheme:** HS256 JWT in the `Authorization: Bearer` header, checked on every route by a global guard.
- **Checked on every request:** signature, algorithm, issuer `banking-event-sourcing`, audience `banking-event-sourcing-api`, and age (a token older than 15 minutes is refused). A token issued in the future is refused (60 seconds of clock skew allowed).
- **Required claims:** `sub` (non-empty), `role`, `iat`, `exp`.
- **Roles:** only `INTERNAL_SUPPORT` is accepted. A token with any other role, or none, is refused with **401**, not 403. All routes accept `INTERNAL_SUPPORT`; only `GET /accounts/:id/events` additionally *requires* it.
- **401 response:** `{"statusCode":401,"code":"UNAUTHENTICATED","message":"Authentication required"}` with header `WWW-Authenticate: Bearer realm="banking-event-sourcing"`. When a token was presented but refused, the header adds `, error="invalid_token"`. The body gives no detail about why (tested).
- **403:** defined (`FORBIDDEN`, "Insufficient permissions") for a recognized role that lacks the route's required role. With only one recognized role, no request can currently reach it.
- **Issuer and key:** this service does not issue tokens. The issuer and audience values are implementer defaults and are not confirmed with a trusted issuer. The signing key is read from the `JWT_SECRET` setting (at least 32 characters; the service will not start without it). In tests, tokens are minted with a test-only key.

## Endpoints

### POST /accounts

**Access:** valid token (any recognized role).
**Description:** Opens a new account with a zero balance.

**Request body**

| Field | Type | Required | Rules |
|---|---|---|---|
| ownerName | string | Yes | Non-empty, at most 100 characters. Stored trimmed; a whitespace-only name is refused (`INVALID_OWNER_NAME`, from code only) |
| currency | string | No | Three upper-case letters (ISO 4217 shape). Defaults to `EUR` |

**Responses**

| Status | Body | When | Verified by |
|---|---|---|---|
| 201 | `{"accountId": "<uuid>"}` | Account opened | `accounts.http.spec.ts` |
| 400 | validation error body | Missing or invalid field, or an unknown property | Code (pipe options); deposits tested |
| 401 | see [Authentication](#authentication) | Missing or refused token | `accounts.auth.http.spec.ts` |

**Example**
```bash
curl -X POST "http://localhost:3000/accounts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ownerName": "Ada", "currency": "EUR"}'
```

### POST /accounts/:id/deposits

**Access:** valid token (any recognized role).
**Description:** Adds money to an account. Idempotent per `operationId`.

| Name | In | Type | Required | Rules |
|---|---|---|---|---|
| id | path | UUID | Yes | Must be a UUID |
| amountMinor | body | integer | Yes | Positive integer; strings, decimals, zero and negatives are refused (tested) |
| operationId | body | string | Yes | Non-empty, at most 100 characters |

**Responses**

| Status | Body | When | Verified by |
|---|---|---|---|
| 200 | `{"accountId": "<uuid>", "operationId": "<id>", "status": "deposited", "balanceMinor": <int>}` | Deposit applied | `accounts.http.spec.ts` |
| 200 | same shape with `"status": "duplicate"` | Same `operationId` and amount already processed; nothing written | `accounts.http.spec.ts` |
| 400 | validation error body | Invalid body or path id, unknown property | `accounts.http.spec.ts` |
| 400 | `INVALID_AMOUNT` | The new balance would exceed the safe integer range | Code only |
| 401 | see [Authentication](#authentication) | Missing or refused token | `accounts.auth.http.spec.ts` |
| 404 | `ACCOUNT_NOT_FOUND` | No such account | `accounts.http.spec.ts` |
| 409 | `OPERATION_ID_REUSED` | `operationId` already used with a different amount (or operation type) | Different amount: `accounts.http.spec.ts` |
| 409 | `CONCURRENCY_CONFLICT` | The account changed concurrently and the retry did not resolve it | Code only (not located in the HTTP specs) |

**Example**
```bash
curl -X POST "http://localhost:3000/accounts/<ACCOUNT_UUID>/deposits" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amountMinor": 1050, "operationId": "dep-001"}'
```
```json
{ "accountId": "<uuid>", "operationId": "dep-001", "status": "deposited", "balanceMinor": 1050 }
```

### POST /accounts/:id/withdrawals

**Access:** valid token (any recognized role).
**Description:** Removes money from an account. Idempotent per `operationId`. The idempotency check runs before the funds check, so a retry of a successful withdrawal returns `duplicate` even if the balance has since dropped.

Parameters and body are the same as for deposits.

**Responses**

| Status | Body | When | Verified by |
|---|---|---|---|
| 200 | `{"accountId": "<uuid>", "operationId": "<id>", "status": "withdrawn", "balanceMinor": <int>}` | Withdrawal applied | `accounts.http.spec.ts` |
| 200 | same shape with `"status": "duplicate"` | Same `operationId` and amount already processed | `accounts.http.spec.ts` |
| 400 | validation error body | Invalid body or path id, unknown property | Code (shared pipe) |
| 401 | see [Authentication](#authentication) | Missing or refused token | `accounts.auth.http.spec.ts` |
| 404 | `ACCOUNT_NOT_FOUND` | No such account | Code (shared handling) |
| 409 | `OPERATION_ID_REUSED` | `operationId` already used with a different amount | `accounts.http.spec.ts` |
| 409 | `CONCURRENCY_CONFLICT` | Concurrent change not resolved by the retry | Code only |
| 422 | `INSUFFICIENT_FUNDS` | Amount exceeds the balance; no event is written | `accounts.http.spec.ts` |

**Example**
```bash
curl -X POST "http://localhost:3000/accounts/<ACCOUNT_UUID>/withdrawals" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amountMinor": 300, "operationId": "wd-001"}'
```

### GET /accounts/:id

**Access:** valid token (any recognized role).
**Description:** Returns the current state of an account, rebuilt by replaying its events.

| Name | In | Type | Required | Rules |
|---|---|---|---|---|
| id | path | UUID | Yes | Must be a UUID |

**Responses**

| Status | Body | When | Verified by |
|---|---|---|---|
| 200 | `{"accountId": "<uuid>", "ownerName": "<name>", "currency": "<ISO code>", "balanceMinor": <int>, "version": <int>}` | Account found. `version` is the number of events replayed | `accounts.http.spec.ts` |
| 400 | framework default for an invalid UUID | `id` is not a UUID (exact body not asserted by tests; status is) | Status: `accounts.http.spec.ts` |
| 401 | see [Authentication](#authentication) | Missing or refused token | `accounts.auth.http.spec.ts` |
| 404 | `ACCOUNT_NOT_FOUND` | No such account | `accounts.http.spec.ts` |

**Example**
```bash
curl "http://localhost:3000/accounts/<ACCOUNT_UUID>" -H "Authorization: Bearer $TOKEN"
```

### GET /accounts/:id/deposits/:operationId

**Access:** valid token (any recognized role).
**Description:** Finds one deposit on an account by its `operationId`.

| Name | In | Type | Required | Rules |
|---|---|---|---|---|
| id | path | UUID | Yes | Must be a UUID |
| operationId | path | string | Yes | Non-empty, at most 100 characters. An empty segment does not match the route and returns the framework's 404 (tested) |

**Responses**

| Status | Body | When | Verified by |
|---|---|---|---|
| 200 | `{"accountId": "<uuid>", "operationId": "<id>", "amountMinor": <int>}` | Deposit found | `accounts.http.spec.ts` |
| 400 | validation error body, e.g. `{"statusCode":400,"error":"Bad Request","message":["operationId must be shorter than or equal to 100 characters"]}` | Invalid `id` or `operationId` | `accounts.http.spec.ts` |
| 401 | see [Authentication](#authentication) | Missing or refused token | `accounts.auth.http.spec.ts` |
| 404 | `ACCOUNT_NOT_FOUND` | No such account | `accounts.http.spec.ts` |
| 404 | `DEPOSIT_NOT_FOUND` (`Account <id> has no deposit with operation <operationId>`) | Account exists, no deposit with that `operationId` | `accounts.http.spec.ts` |

Only deposits are searched. A withdrawal's `operationId` returns `DEPOSIT_NOT_FOUND`.

**Example**
```bash
curl "http://localhost:3000/accounts/<ACCOUNT_UUID>/deposits/dep-001" -H "Authorization: Bearer $TOKEN"
```

### GET /accounts/:id/events

**Access:** valid token **with the `INTERNAL_SUPPORT` role**.
**Description:** Returns the account's full raw event history, oldest first, straight from its event stream. No pagination, no filters.

| Name | In | Type | Required | Rules |
|---|---|---|---|---|
| id | path | UUID | Yes | Must be a UUID |

**Responses**

| Status | Body | When | Verified by |
|---|---|---|---|
| 200 | array of events (below) | Account found | `accounts.auth.http.spec.ts` (length), `accounts.http.spec.ts` |
| 400 | framework default for an invalid UUID | `id` is not a UUID | Status: `accounts.http.spec.ts` |
| 401 | see [Authentication](#authentication) | Missing token, or a token whose role is not recognized | `accounts.auth.http.spec.ts` |
| 404 | `ACCOUNT_NOT_FOUND` | No events exist for this account | `accounts.http.spec.ts` |

**Event object**

| Field | Type | Notes |
|---|---|---|
| version | integer | Position in this account's stream, starting at 1 |
| event | string | `account-opened`, `money-deposited` or `money-withdrawn` |
| eventId | string | Unique event ID |
| occurredOn | string | ISO 8601 timestamp |
| globalPosition | string or null | Decimal string, because a bigint does not fit in JSON |
| payload | object | The stored event data, returned as stored |

Payloads: `account-opened` → `accountId`, `ownerName`, `currency`. `money-deposited` and `money-withdrawn` → `accountId`, `amountMinor`, `operationId`.

**Example**
```bash
curl "http://localhost:3000/accounts/<ACCOUNT_UUID>/events" -H "Authorization: Bearer $SUPPORT_TOKEN"
```
```json
[
  { "version": 1, "event": "account-opened", "eventId": "<uuid>", "occurredOn": "<ISO 8601>", "globalPosition": "<n>",
    "payload": { "accountId": "<uuid>", "ownerName": "Ada", "currency": "EUR" } }
]
```

## Error codes

Only codes the six routes above can return. Messages are quoted from the code.

| Code | HTTP status | Message | Raised by |
|---|---|---|---|
| UNAUTHENTICATED | 401 | `Authentication required` | Global guard |
| FORBIDDEN | 403 | `Insufficient permissions` | Guard, role check. Not reachable today (see Authentication) |
| ACCOUNT_NOT_FOUND | 404 | `Account <id> does not exist` | Deposit, withdraw, state, deposit lookup, events |
| DEPOSIT_NOT_FOUND | 404 | `Account <id> has no deposit with operation <operationId>` | Deposit lookup |
| OPERATION_ID_REUSED | 409 | `Operation <operationId> was already used for a different request` | Deposit, withdraw |
| CONCURRENCY_CONFLICT | 409 | `Stream <streamId> was modified concurrently; reload and retry` | Deposit, withdraw |
| INSUFFICIENT_FUNDS | 422 | `Account <id> has <balance> minor units, cannot withdraw <amount>` | Withdraw |
| INVALID_AMOUNT | 400 | message varies, for example the resulting balance exceeds the supported range | Deposit |
| INVALID_OWNER_NAME | 400 | message varies | Open account |
| INVALID_CURRENCY | 400 | message varies | Open account (normally caught earlier by body validation) |
| INVALID_ID | 400 | `Invalid id` | Malformed ID that reaches the event store |

## Not exposed over HTTP

These are implemented and unit/e2e tested, but no controller route dispatches them and no module registers them, so there is no URL to call in release 0.1.0:

- Withdrawal history for an account (`GetWithdrawalHistoryQuery`)
- Support lookup of one withdrawal by `operationId` (`GetWithdrawalDetailsQuery`)
- Support lookup of withdrawals by date range (`ListSupportWithdrawalsQuery`)

Their error codes (`WITHDRAWAL_NOT_FOUND`, `INVALID_DATE_RANGE`, `INVALID_DATE`, `FUTURE_DATE`, `INVALID_PAGE_SIZE`, `AUDIT_UNAVAILABLE`, `AUDIT_CONTEXT_MISSING`) are defined and mapped, but none of the six routes can return them. Do not document their URLs until routes exist.

## Open questions and doc/code disagreements

- **403 is unreachable today.** Only one role is recognized, and unrecognized roles get 401, so `FORBIDDEN` cannot be returned yet.
- **Existing clients are locked out.** All routes need a token, nothing in this repo issues tokens, and only `INTERNAL_SUPPORT` is accepted.
- **Not backed by an HTTP test:** `CONCURRENCY_CONFLICT`, `INVALID_AMOUNT` (overflow), `INVALID_OWNER_NAME`, the exact body of the invalid-UUID 400, and operation-type mismatch for `OPERATION_ID_REUSED`.
- **Error contract still proposals:** status codes for the unexposed lookups (`WITHDRAWAL_NOT_FOUND` etc.) are not final.
