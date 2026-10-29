import { Logger } from '@nestjs/common';
import pg from 'pg';
import { AuditUnavailableError } from '../shared/domain-errors.js';
import type { AuditRecord } from './audit-record.js';
import { AuditWriter } from './audit-writer.js';

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

const INSERT = `
  INSERT INTO audit_records
    (occurred_at, actor_type, actor_id, account_id, action, outcome,
     reason_code, query, case_id, note, result_count)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;

/**
 * Writes audit rows to PostgreSQL through its own `pg` pool (no new dependency).
 * Every statement is bounded by `timeoutMs`; any failure or timeout is raised as
 * AuditUnavailableError so the lookup fails closed (W3).
 */
export class PgAuditWriter extends AuditWriter {
  private readonly logger = new Logger(PgAuditWriter.name);
  private readonly pool: pg.Pool;

  constructor(connectionString: string, timeoutMs: number) {
    super();
    this.pool = new pg.Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: timeoutMs,
      query_timeout: timeoutMs,
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
   * Creates the table only when it is missing, so a start-up with an existing
   * table needs no DDL rights. This keeps the least-privilege app role working.
   */
  async ensureTable(): Promise<void> {
    const { rows } = await this.pool.query<{ exists: boolean }>(
      `SELECT to_regclass('audit_records') IS NOT NULL AS exists`,
    );
    if (rows[0].exists) return;

    await this.pool.query(CREATE_TABLE);
    for (const statement of CREATE_INDEXES) {
      await this.pool.query(statement);
    }
  }

  async write(record: AuditRecord): Promise<void> {
    try {
      await this.pool.query(INSERT, [
        record.occurredAt,
        record.actorType,
        record.actorId,
        record.accountId,
        record.action,
        record.outcome,
        record.reasonCode,
        JSON.stringify(record.query),
        record.caseId,
        record.note,
        record.resultCount,
      ]);
    } catch {
      throw new AuditUnavailableError();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
