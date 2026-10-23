# CLAUDE.md — Banking Event Sourcing

## Project
Learning project, not production banking. NestJS 12 (ESM), TypeScript, `@ocoda/event-sourcing` 4.1, PostgreSQL 17.

- Implemented: account opening, deposits, withdrawals, event replay, event history.
- Planned: transfers, read-model projections (Phase 3).
- Details: `docs/architecture.md`, `docs/learning-log.md`.

## Build and Run
- Setup: `nvm use && npm install` (Node >=24.15; see `.nvmrc`).
- Environment: `cp .env.example .env`; configure `DATABASE_URL` and `TEST_DATABASE_URL`. Never print environment values.
- Database: `docker compose up -d --wait` (PostgreSQL host port 5433).
- Development: `npm run start:dev`; production-style: `npm start`.
- Build/typecheck: `npm run build`; `npm run typecheck`.
- Unit and HTTP tests: `npm test` (in-memory store).
- PostgreSQL integration tests: `npm run test:e2e`.
- Lint: `npm run lint`. `npm run format` rewrites files; run only when requested.

## Coding Conventions
- Follow `src/<context>/{domain,application/{commands,queries},infrastructure,api}`; shared code belongs in `src/shared/`.
- Keep domain logic free of I/O. Follow existing NestJS and TypeScript patterns.
- Use kebab-case filenames with role suffixes (`.aggregate.ts`, `.events.ts`, `.command.ts`, `.query.ts`, `.spec.ts`). Relative ESM imports end in `.js`.
- Declare explicit kebab-case event names with `@Event('...')`; don't derive names from class names.
- Throw `DomainError` subclasses with stable codes; map them to HTTP responses only in `DomainExceptionFilter`.
- Validate HTTP DTOs with `class-validator` and the configured global `ValidationPipe` (`whitelist` and `forbidNonWhitelisted`).
- Represent money as integer minor units using `src/shared/money.ts`; use `number` with `Number.isSafeInteger`, never floating-point arithmetic.
- Keep changes focused and copy established patterns before introducing new ones.

## Event Sourcing Rules
- Commands use `CommandBus`; queries use `QueryBus`.
- `Account` is the aggregate; streams use `account-<id>`.
- Decision methods validate business rules and call `applyEvent`; only `@EventHandler` methods change aggregate state.
- Events are immutable historical facts. Never rename existing event names or change stored payloads; use an explicit new event or migration strategy when evolution is required.
- `AccountRepository` rebuilds state by replaying events and appends using `expectedVersion = committedVersion`. Handle conflicts as `ConcurrencyConflictError` (HTTP 409).
- `operationId` provides idempotency for deposits and withdrawals and is rebuilt on replay. Reusing an ID with a different amount, or with a different operation type, must raise `OperationIdReusedError`. Withdrawals check idempotency before funds.
- Validate before applying events. Invalid commands must not persist events.
- Use Ocoda's `EventStore` and configured PostgreSQL driver; do not introduce a competing event store.
- `GetAccountState` currently replays the stream; read-model projections are not yet implemented.
- Amounts must be positive safe integers; balances must remain safe integers.
- The current store guarantees atomic appends per stream only. Cross-account transfers require an explicitly designed consistency strategy; a saga is planned, not implemented.

## Testing and Verification
- Test aggregate rules using given events, when command, then events.
- Add regression tests for bug fixes and behavior changes.
- Run `npm run test:e2e` when changing persistence, event serialization, or database integration.
- Before finishing, run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` when feasible. Report actual results and checks not run.
- Inspect the final diff for unintended changes; never claim an unverified check passed.

## Never
- Expose credentials, tokens, or sensitive values in code, logs, documentation, or responses.
- Rewrite stored events or change existing event payloads without an explicit evolution strategy.
- Bypass aggregate invariants or weaken/skip tests just to pass.
- Add dependencies, an ORM, or another event store without approval.
- Edit outside `capstone/banking-event-sourcing/` unless asked.
- Commit, push, merge, or open a PR without explicit approval.