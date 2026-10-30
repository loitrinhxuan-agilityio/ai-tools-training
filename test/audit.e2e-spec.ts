import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { AppModule } from '../src/app.module.js';
import { AuditWriter } from '../src/audit/audit-writer.js';
import type { AuditRecord } from '../src/audit/audit-record.js';
import { AUDIT_DDL_LOCK_KEY, PgAuditWriter } from '../src/audit/pg-audit-writer.js';
import { SupportLookupAuditor } from '../src/audit/support-lookup-auditor.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { loadConfig } from '../src/config/env.js';
import { AuditUnavailableError, InvalidDateError } from '../src/shared/domain-errors.js';
import { TEST_JWT_SECRET } from './support/test-tokens.js';

/*
 * Audit rows in the real Postgres test database (WH-04). Runs with the default
 * audit module, so the table is created at startup, as in production.
 */
describe('Audit records in Postgres (WH-04)', () => {
  let app: INestApplication;
  let db: pg.Client;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.register(AppModule.postgresEventSourcing(), AuthModule.forSecret(TEST_JWT_SECRET)),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = new pg.Client({ connectionString: loadConfig().databaseUrl });
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
    await app.close();
  });

  const countEvents = async () =>
    (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM events')).rows[0].n;

  it('writes an audit row and leaves the event stream untouched', async () => {
    const actorId = `staff-${randomUUID()}`;
    const accountId = randomUUID();
    const eventsBefore = await countEvents();

    const record: AuditRecord = {
      occurredAt: new Date('2026-10-29T10:00:00.000Z'),
      actorType: 'support',
      actorId,
      accountId,
      action: 'withdrawal-lookup-by-operation',
      outcome: 'success',
      reasonCode: null,
      query: { operationId: 'op-1' },
      caseId: 'CASE-1',
      note: 'checked with customer',
      resultCount: 1,
    };
    await app.get(AuditWriter).write(record);

    const { rows } = await db.query(
      `SELECT actor_type, actor_id, account_id, action, outcome, reason_code,
              query, case_id, note, result_count
         FROM audit_records WHERE actor_id = $1`,
      [actorId],
    );
    expect(rows).toEqual([
      {
        actor_type: 'support',
        actor_id: actorId,
        account_id: accountId,
        action: 'withdrawal-lookup-by-operation',
        outcome: 'success',
        reason_code: null,
        query: { operationId: 'op-1' },
        case_id: 'CASE-1',
        note: 'checked with customer',
        result_count: 1,
      },
    ]);

    // TC-WH04-007: the audit row is not an event on any account stream.
    expect(await countEvents()).toBe(eventsBefore);
  });

  /*
   * The DDL path, which an ordinary start skips once the schema is in place.
   * Dropping the indexes puts the schema back in the state an interrupted
   * start leaves behind, and the writers then contend for the advisory lock
   * exactly as parallel instances or e2e workers would. The dropped state is
   * not asserted: the other e2e file boots the app in a parallel thread and
   * may legitimately rebuild the indexes first.
   */
  it('completes a half-created schema even when several writers start at once', async () => {
    const indexNames = async () =>
      (
        await db.query<{ relname: string }>(
          `SELECT relname FROM pg_class
             WHERE relname IN ('audit_records_account_idx', 'audit_records_actor_idx')
             ORDER BY relname`,
        )
      ).rows.map((row) => row.relname);

    await db.query('DROP INDEX IF EXISTS audit_records_account_idx');
    await db.query('DROP INDEX IF EXISTS audit_records_actor_idx');

    const writers = Array.from(
      { length: 4 },
      () => new PgAuditWriter(loadConfig().databaseUrl, 10_000),
    );
    try {
      await Promise.all(writers.map((writer) => writer.ensureTable()));
    } finally {
      await Promise.all(writers.map((writer) => writer.close()));
    }

    expect(await indexNames()).toEqual([
      'audit_records_account_idx',
      'audit_records_actor_idx',
    ]);
  });

  /*
   * Fresh-database start-up, in a throwaway schema. The writers are pointed at
   * it through the connection's search_path, so no table exists for them to
   * find, and nothing here touches `public` or races the other e2e file.
   */
  describe('ensureTable on a fresh schema', () => {
    let schema: string;
    let url: string;

    beforeEach(async () => {
      schema = `audit_e2e_${randomUUID().replaceAll('-', '')}`;
      await db.query(`CREATE SCHEMA ${schema}`);
      const parsed = new URL(loadConfig().databaseUrl);
      parsed.searchParams.set('options', `-c search_path=${schema}`);
      url = parsed.toString();
    });

    afterEach(async () => {
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
    });

    const relationsPresent = async () =>
      (
        await db.query<{ relname: string }>(
          `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 ORDER BY c.relname`,
          [schema],
        )
      ).rows
        .map((row) => row.relname)
        .filter((name) => name.startsWith('audit_records'));

    const ALL = ['audit_records', 'audit_records_account_idx', 'audit_records_actor_idx', 'audit_records_pkey'];

    it('lets several writers start at once, building the table and both indexes once', async () => {
      const writers = Array.from({ length: 4 }, () => new PgAuditWriter(url, 10_000));
      try {
        await Promise.all(writers.map((writer) => writer.ensureTable()));
      } finally {
        await Promise.all(writers.map((writer) => writer.close()));
      }

      expect(await relationsPresent()).toEqual(ALL);
    });

    it('is not held to the write timeout', async () => {
      // A 1 ms write timeout cannot even connect; start-up has its own budget.
      const writer = new PgAuditWriter(url, 1);
      try {
        await writer.ensureTable();
      } finally {
        await writer.close();
      }

      expect(await relationsPresent()).toEqual(ALL);
    });

    it('fails the start within its budget when another session holds the DDL lock, then recovers', async () => {
      const holder = new pg.Client({ connectionString: loadConfig().databaseUrl });
      await holder.connect();
      await holder.query('SELECT pg_advisory_lock($1)', [AUDIT_DDL_LOCK_KEY]);

      const writer = new PgAuditWriter(url, 2000, { startupTimeoutMs: 300 });
      try {
        const started = performance.now();
        const failure = await writer.ensureTable().catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(Error);
        expect(failure).not.toBeInstanceOf(AuditUnavailableError);
        expect(performance.now() - started).toBeLessThan(5000);
        // The aborted attempt left nothing behind.
        expect(await relationsPresent()).toEqual([]);

        await holder.query('SELECT pg_advisory_unlock($1)', [AUDIT_DDL_LOCK_KEY]);
        await writer.ensureTable();
        expect(await relationsPresent()).toEqual(ALL);
      } finally {
        await holder.end();
        await writer.close();
      }
    });
  });

  it('stores an audit row for input PostgreSQL would otherwise refuse', async () => {
    const actorId = `staff-${randomUUID()}`;
    await app.get(AuditWriter).write({
      occurredAt: new Date('2026-10-29T10:00:00.000Z'),
      actorType: 'support',
      actorId,
      accountId: randomUUID(),
      action: 'withdrawal-lookup-by-range',
      outcome: 'rejected',
      reasonCode: 'INVALID_DATE',
      query: { from: 'a\u0000b', to: 'x\uD800y' },
      caseId: 'CASE\u0000-1',
      note: 'n\u0000',
      resultCount: null,
    });

    const { rows } = await db.query(
      'SELECT query, case_id, note FROM audit_records WHERE actor_id = $1',
      [actorId],
    );
    expect(rows).toEqual([
      {
        query: { from: 'a\\u0000b', to: 'x\\ud800y' },
        case_id: 'CASE\\u0000-1',
        note: 'n\\u0000',
      },
    ]);
  });

  it('still records a rejected lookup, and still raises the original error, when its input is hostile', async () => {
    const actorId = `staff-${randomUUID()}`;
    const rejection = new InvalidDateError('from', 'malformed');
    const auditor = new SupportLookupAuditor(app.get(AuditWriter));

    await expect(
      auditor.run(
        { actorId, caseId: null, note: null },
        {
          accountId: randomUUID(),
          action: 'withdrawal-lookup-by-range',
          query: { from: '\u0000' },
        },
        async () => {
          throw rejection;
        },
        () => 1,
      ),
    ).rejects.toBe(rejection);

    const { rows } = await db.query(
      'SELECT outcome, reason_code FROM audit_records WHERE actor_id = $1',
      [actorId],
    );
    expect(rows).toEqual([{ outcome: 'rejected', reason_code: 'INVALID_DATE' }]);
  });

  it('rejects an outcome outside the approved set (CHECK constraint)', async () => {
    await expect(
      db.query(
        `INSERT INTO audit_records (occurred_at, actor_type, actor_id, account_id, action, outcome, query)
         VALUES (now(), 'support', 'staff-x', 'acc-x', 'withdrawal-lookup-by-range', 'maybe', '{}')`,
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
