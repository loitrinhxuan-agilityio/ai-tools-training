import { AuditUnavailableError, WithdrawalNotFoundError } from '../shared/domain-errors.js';
import type { AuditRecord } from './audit-record.js';
import { AuditWriter } from './audit-writer.js';
import { InMemoryAuditWriter } from './in-memory-audit-writer.js';
import { SupportLookupAuditor, type SupportAuditContext } from './support-lookup-auditor.js';

const CONTEXT: SupportAuditContext = {
  actorId: 'staff-1',
  caseId: 'CASE-42',
  note: 'customer call',
};

const DETAILS = {
  accountId: 'acc-1',
  action: 'withdrawal-lookup-by-operation' as const,
  query: { operationId: 'op-1' },
};

/** A writer that always fails, as a timed-out or unreachable store would. */
class FailingAuditWriter extends AuditWriter {
  async ensureTable(): Promise<void> {}
  async write(): Promise<void> {
    throw new Error('connection refused');
  }
}

describe('SupportLookupAuditor (fail-closed audit, WH-04)', () => {
  it('writes one success row with the result count, then returns the data', async () => {
    const writer = new InMemoryAuditWriter();
    const auditor = new SupportLookupAuditor(writer);

    const value = await auditor.run(CONTEXT, DETAILS, async () => ({ items: [1, 2] }), (v) => v.items.length);

    expect(value).toEqual({ items: [1, 2] });
    expect(writer.records).toHaveLength(1);
    const [row] = writer.records;
    expect(row).toMatchObject({
      actorType: 'support',
      actorId: 'staff-1',
      accountId: 'acc-1',
      action: 'withdrawal-lookup-by-operation',
      outcome: 'success',
      reasonCode: null,
      query: { operationId: 'op-1' },
      caseId: 'CASE-42',
      note: 'customer call',
      resultCount: 2,
    });
    expect(row.occurredAt).toBeInstanceOf(Date);
  });

  it('records an empty result as result_count 0 (W4)', async () => {
    const writer = new InMemoryAuditWriter();
    const auditor = new SupportLookupAuditor(writer);

    await auditor.run(CONTEXT, DETAILS, async () => ({ items: [] }), (v) => v.items.length);

    expect(writer.records[0].resultCount).toBe(0);
    expect(writer.records[0].outcome).toBe('success');
  });

  it('writes a rejected row for a DomainError and rethrows the original error', async () => {
    const writer = new InMemoryAuditWriter();
    const auditor = new SupportLookupAuditor(writer);
    const notFound = new WithdrawalNotFoundError('acc-1', 'op-1');

    await expect(
      auditor.run(CONTEXT, DETAILS, async () => {
        throw notFound;
      }, () => 1),
    ).rejects.toBe(notFound);

    expect(writer.records).toHaveLength(1);
    expect(writer.records[0]).toMatchObject({
      outcome: 'rejected',
      reasonCode: 'WITHDRAWAL_NOT_FOUND',
      resultCount: null,
    });
  });

  it('withholds the data when the success row cannot be written', async () => {
    const auditor = new SupportLookupAuditor(new FailingAuditWriter());

    await expect(
      auditor.run(CONTEXT, DETAILS, async () => ({ items: [1] }), (v) => v.items.length),
    ).rejects.toBeInstanceOf(AuditUnavailableError);
  });

  it('reports AUDIT_UNAVAILABLE, not the original rejection, when a rejected row cannot be written', async () => {
    const auditor = new SupportLookupAuditor(new FailingAuditWriter());

    await expect(
      auditor.run(CONTEXT, DETAILS, async () => {
        throw new WithdrawalNotFoundError('acc-1', 'op-1');
      }, () => 1),
    ).rejects.toMatchObject({ code: 'AUDIT_UNAVAILABLE' });
  });

  it('records an unexpected read failure as rejected with READ_FAILED, then rethrows it', async () => {
    const writer = new InMemoryAuditWriter();
    const auditor = new SupportLookupAuditor(writer);
    const unexpected = new Error('store exploded');

    await expect(
      auditor.run(CONTEXT, DETAILS, async () => {
        throw unexpected;
      }, () => 1),
    ).rejects.toBe(unexpected);

    expect(writer.records).toHaveLength(1);
    expect(writer.records[0]).toMatchObject({ outcome: 'rejected', reasonCode: 'READ_FAILED' });
  });

  it('reports AUDIT_UNAVAILABLE when even the READ_FAILED row cannot be written', async () => {
    const auditor = new SupportLookupAuditor(new FailingAuditWriter());

    await expect(
      auditor.run(CONTEXT, DETAILS, async () => {
        throw new Error('store exploded');
      }, () => 1),
    ).rejects.toMatchObject({ code: 'AUDIT_UNAVAILABLE' });
  });

  it('passes the record to the writer exactly once per attempt', async () => {
    const seen: AuditRecord[] = [];
    const writer = new InMemoryAuditWriter();
    const spy = vi.spyOn(writer, 'write').mockImplementation(async (record) => {
      seen.push(record);
    });

    await new SupportLookupAuditor(writer).run(CONTEXT, DETAILS, async () => 'ok', () => 1);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(seen[0].actorId).toBe('staff-1');
  });
});
