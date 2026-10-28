# Learning log

## 2026-10-16 — Phase 1: research and plan

- Verified on npm: `@ocoda/event-sourcing` 4.1.0 is ESM-only and needs Node ≥22.12 and NestJS 12. The NestJS 12 schematics need Node ≥24.15. Local Node was 18.20, so we installed 24.22.0.
- Ocoda appends atomically **per stream only**, and its subscribers are at-most-once, not awaited, and run in parallel. This drove two decisions: a Transfer saga instead of an atomic two-account write, and a checkpointed `readAll` projector instead of trusting subscriber delivery (both Phase 3).
- The CodeWiz article is useful for concepts, but its code uses `double` money, has no concurrency control, and its sample output is wrong (it says 650; the operations give 750).

## 2026-10-16 — Phase 2: foundation

**Built:** scaffolded with `nest new` (ESM, Vitest, oxlint); Postgres 17 via docker compose (dev + test DBs); `OpenAccount`, `DepositMoney`, `GetAccountState` (replay) and `GetAccountEventHistory`.

**Results (actually run):**
- `npm test`: 3 files, 34 tests passed (aggregate given/when/then, money rules, HTTP flow on the in-memory store).
- `npm run test:e2e`: 3 tests passed against Postgres: rows in `events`, optimistic-concurrency conflict, and replay after an app restart.
- Mutation check: switching the repository to `ExpectedVersion.Any` made the concurrency test fail, so the test does detect lost updates.
- `npm run lint`, `npm run build`, and `tsc --noEmit` are clean. A curl smoke test against the dev DB behaved as documented in the README.

**Surprises:**
- `ensureCollection()` is never called automatically. With `ddl: 'auto'` it creates the table, but only when you call it, so the app does it at bootstrap.
- `nest new --skip-git` produced no `.gitignore`, so we added one.
- The "JSON parse failed" lint error came from the RTK command-rewriting hook parsing oxlint's empty output, not from the project. `rtk proxy npm run lint` shows a clean exit 0.

**Lessons:**
- State changes only in `@EventHandler`, so replay and live execution share one code path. The replay test checks this directly.
- Validate *before* `applyEvent`: a stored event that can't be replayed (for example, a balance overflow) would break the stream forever.
- Idempotency keys belong in the events themselves; that's how they survive replay.

**Next exercise (Phase 3):** add `WithdrawMoney` with the insufficient-funds rule, then the Transfer aggregate and saga, then the checkpointed projector for balances and transactions.
