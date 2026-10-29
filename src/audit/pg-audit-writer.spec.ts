import { AuditUnavailableError } from '../shared/domain-errors.js';
import type { AuditRecord } from './audit-record.js';
import { PgAuditWriter } from './pg-audit-writer.js';

/*
 * Unit-level: no database. Port 1 refuses connections at once, so the write
 * must fail and be reported as AuditUnavailableError (W3), not a raw pg error.
 */
const UNREACHABLE = 'postgres://nobody:nothing@127.0.0.1:1/none';

const RECORD: AuditRecord = {
  occurredAt: new Date('2026-10-29T10:00:00.000Z'),
  actorType: 'support',
  actorId: 'staff-1',
  accountId: 'acc-1',
  action: 'withdrawal-lookup-by-range',
  outcome: 'success',
  reasonCode: null,
  query: { from: '2026-10-01', to: '2026-10-29', pageSize: 20 },
  caseId: 'CASE-1',
  note: null,
  resultCount: 3,
};

describe('PgAuditWriter', () => {
  let writer: PgAuditWriter;

  beforeEach(() => {
    writer = new PgAuditWriter(UNREACHABLE, 500);
  });

  afterEach(async () => {
    await writer.close();
  });

  it('reports an unreachable store as AuditUnavailableError', async () => {
    await expect(writer.write(RECORD)).rejects.toBeInstanceOf(AuditUnavailableError);
  });

  it('reports a failed table creation as a plain error at startup, not as a lookup failure', async () => {
    await expect(writer.ensureTable()).rejects.toThrow();
    await expect(writer.ensureTable()).rejects.not.toBeInstanceOf(AuditUnavailableError);
  });
});
