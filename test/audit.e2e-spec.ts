import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { AppModule } from '../src/app.module.js';
import { AuditWriter } from '../src/audit/audit-writer.js';
import type { AuditRecord } from '../src/audit/audit-record.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { loadConfig } from '../src/config/env.js';
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

  it('rejects an outcome outside the approved set (CHECK constraint)', async () => {
    await expect(
      db.query(
        `INSERT INTO audit_records (occurred_at, actor_type, actor_id, account_id, action, outcome, query)
         VALUES (now(), 'support', 'staff-x', 'acc-x', 'withdrawal-lookup-by-range', 'maybe', '{}')`,
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
