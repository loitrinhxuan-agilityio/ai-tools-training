import { Logger } from '@nestjs/common';
import pg from 'pg';
import { AuditUnavailableError } from '../shared/domain-errors.js';
import type { AuditRecord } from './audit-record.js';
import { AuditWriter } from './audit-writer.js';
import { safeJson, safeNullableText, safeText } from './postgres-safe.js';

/*
 * Append-only by grant, not by code: the table is created by this writer, but
 * the production app role should hold only INSERT and SELECT on it (W1). Whether
 * the app role may run DDL in production is still to be confirmed.
 */
const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS audit_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at timestamptz NOT NULL,
    actor_type text NOT NULL,
    actor_id text NOT NULL,
    account_id text NOT NULL,
    action text NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'rejected')),
    reason_code text,
    query jsonb NOT NULL,
    case_id text,
    note text,
    result_count integer
  )`;

const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS audit_records_account_idx ON audit_records (account_id, occurred_at)',
  'CREATE INDEX IF NOT EXISTS audit_records_actor_idx ON audit_records (actor_id, occurred_at)',
];

/*
 * Everything CREATE_TABLE and CREATE_INDEXES build. The schema counts as ready
 * only when all of them exist, so a start-up that stopped after the table was
 * created still gets its indexes on the next one.
 */
const AUDIT_RELATIONS = [
  'audit_records',
  'audit_records_account_idx',
  'audit_records_actor_idx',
];

/* `to_regclass` resolves index names as well as table names, and yields NULL
 * rather than failing when the relation is absent. */
const SCHEMA_READY = `
  SELECT bool_and(to_regclass(relation) IS NOT NULL) AS ready
  FROM unnest($1::text[]) AS relation`;

/*
 * Serializes the start-up DDL across processes. Concurrent
 * `CREATE TABLE IF NOT EXISTS` is not safe in PostgreSQL: two sessions can both
 * find the table missing, and one then fails with a duplicate-key error on the
 * pg_type or pg_class catalog. The key is arbitrary but must stay stable.
 */
export const AUDIT_DDL_LOCK_KEY = 4_173_209_866;

/*
 * Time allowed for each step of the start-up DDL: connecting, each statement,
 * and waiting for the lock. Deliberately apart from AUDIT_WRITE_TIMEOUT_MS,
 * which bounds one audit insert and is short on purpose (fail closed). Slow
 * DDL or a slow first handshake at boot must not be held to that bound.
 */
export const STARTUP_TIMEOUT_MS = 30_000;

const INSERT = `
  INSERT INTO audit_records
    (occurred_at, actor_type, actor_id, account_id, action, outcome,
     reason_code, query, case_id, note, result_count)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;

export interface PgAuditWriterOptions {
  /** Budget for each start-up DDL step. Defaults to STARTUP_TIMEOUT_MS. */
  startupTimeoutMs?: number;
  /** Replaces the write pool. For tests only. */
  pool?: pg.Pool;
}

/**
 * Writes audit rows to PostgreSQL through its own `pg` pool (no new dependency).
 * One audit write, from waiting for a connection to the end of the INSERT, is
 * bounded by `timeoutMs` as a whole. Any failure or timeout is raised as
 * AuditUnavailableError so the lookup fails closed (W3).
 */
export class PgAuditWriter extends AuditWriter {
  private readonly logger = new Logger(PgAuditWriter.name);
  private readonly pool: pg.Pool;
  private readonly startupTimeoutMs: number;

  constructor(
    private readonly connectionString: string,
    private readonly timeoutMs: number,
    options: PgAuditWriterOptions = {},
  ) {
    super();
    this.startupTimeoutMs = options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS;
    // No pool-level query_timeout: it would start a second full clock after
    // the connection is acquired. write() gives the query what is left of the
    // one budget. statement_timeout stays as the server-side backstop.
    this.pool =
      options.pool ??
      new pg.Pool({
        connectionString,
        max: 5,
        connectionTimeoutMillis: timeoutMs,
        statement_timeout: timeoutMs,
      });
    // An idle connection error must not crash the process. The next write that
    // needs the connection fails and is reported as AuditUnavailableError; this
    // log keeps the root cause visible.
    this.pool.on('error', (error) => {
      this.logger.error(`Idle audit connection failed: ${error.message}`);
    });
  }

  /*
   * Runs DDL only when part of the schema is missing, so a start-up with the
   * table and indexes in place needs no DDL rights. This keeps the
   * least-privilege app role working.
   *
   * When DDL is needed, it runs in one transaction that holds an advisory lock:
   * parallel starts (several instances, or e2e workers) then queue instead of
   * racing, and a process that dies midway commits nothing for the next start
   * to mistake for a finished schema.
   *
   * It uses its own short-lived client, not the write pool, so the start-up
   * budget (STARTUP_TIMEOUT_MS) is independent of the write timeout. Waiting
   * for the lock is bounded too, so a stuck holder fails the boot with an
   * error instead of hanging it.
   */
  async ensureTable(): Promise<void> {
    const budget = this.startupTimeoutMs;
    const client = new pg.Client({
      connectionString: this.connectionString,
      connectionTimeoutMillis: budget,
      statement_timeout: budget,
      query_timeout: budget,
      lock_timeout: budget,
    });
    // A dropped connection emits 'error'; without a listener it would crash the process.
    client.on('error', (error) => {
      this.logger.error(`Audit start-up connection failed: ${error.message}`);
    });

    await client.connect();
    try {
      if (await this.schemaReady(client)) return;

      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock($1)', [AUDIT_DDL_LOCK_KEY]);
        // Re-checked under the lock: whoever went first may have built
        // everything already, and then we need no DDL rights at all.
        if (!(await this.schemaReady(client))) {
          await client.query(CREATE_TABLE);
          for (const statement of CREATE_INDEXES) {
            await client.query(statement);
          }
        }
        await client.query('COMMIT');
      } catch (error) {
        // The rollback itself may fail on a broken connection; the original
        // error is what the caller needs to see.
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  async write(record: AuditRecord): Promise<void> {
    const started = performance.now();
    let client: pg.PoolClient | undefined;
    let failure: Error | undefined;
    try {
      const values = [
        record.occurredAt,
        record.actorType,
        safeText(record.actorId),
        safeText(record.accountId),
        record.action,
        record.outcome,
        safeNullableText(record.reasonCode),
        safeJson(record.query),
        safeNullableText(record.caseId),
        safeNullableText(record.note),
        record.resultCount,
      ];
      // Connecting is bounded by connectionTimeoutMillis; the query then gets
      // only what is left, so acquire plus INSERT stays within one timeoutMs.
      client = await this.pool.connect();
      const remaining = this.timeoutMs - (performance.now() - started);
      if (remaining <= 0) throw new Error('Audit write budget used up before the query');
      // pg reads a per-query `query_timeout` (pg/lib/client.js), but @types/pg
      // does not declare it on QueryConfig.
      const query: pg.QueryConfig & { query_timeout: number } = {
        text: INSERT,
        values,
        query_timeout: Math.ceil(remaining),
      };
      await client.query(query);
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    } finally {
      // Releasing with an error destroys the connection, so one that timed out
      // with a statement still in flight is never reused.
      client?.release(failure);
    }
    if (failure) throw new AuditUnavailableError();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async schemaReady(client: pg.Client): Promise<boolean> {
    const { rows } = await client.query<{ ready: boolean }>(SCHEMA_READY, [AUDIT_RELATIONS]);
    return rows[0].ready;
  }
}
