import {
  EventSourcingErrorCode,
  isEventSourcingError,
  type EventEnvelope,
  type EventStore,
} from '@ocoda/event-sourcing';
import { AuditWriter } from '../../../audit/audit-writer.js';
import { InMemoryAuditWriter } from '../../../audit/in-memory-audit-writer.js';
import { SupportLookupAuditor, type SupportAuditContext } from '../../../audit/support-lookup-auditor.js';
import { AccountId } from '../../domain/account-id.js';
import {
  GetWithdrawalDetailsHandler,
  GetWithdrawalDetailsQuery,
} from './get-withdrawal-details.query.js';

/*
 * WH-04 behaviour of the details lookup: one audit row per attempt, and no
 * data unless the row was written. Uses a stub store, as the other query specs do.
 */
const ACCOUNT_ID = AccountId.generate().value;
const SUPPORT: SupportAuditContext = { actorId: 'staff-1', caseId: 'CASE-1', note: null };
const OCCURRED_ON = new Date('2026-10-01T09:30:00.000Z');

const withdrawal = {
  event: 'money-withdrawn',
  payload: { accountId: ACCOUNT_ID, amountMinor: 200, operationId: 'op-1' },
  metadata: { version: 2, occurredOn: OCCURRED_ON },
} as unknown as EventEnvelope;

/** A store that holds the account with one withdrawal, and counts reads. */
function storeWith(envelopes: EventEnvelope[]) {
  const store = {
    reads: 0,
    async *getEnvelopes() {
      store.reads++;
      yield envelopes;
    },
  };
  return store as typeof store & EventStore;
}

/** A writer that always fails, as an unreachable or timed-out audit store would. */
class FailingAuditWriter extends AuditWriter {
  async ensureTable(): Promise<void> {}
  async write(): Promise<void> {
    throw new Error('connection refused');
  }
}

describe('GetWithdrawalDetailsHandler audit (WH-04)', () => {
  it('writes one success row and returns the withdrawal', async () => {
    const writer = new InMemoryAuditWriter();
    const handler = new GetWithdrawalDetailsHandler(
      storeWith([withdrawal]),
      new SupportLookupAuditor(writer),
    );

    const result = await handler.execute(
      new GetWithdrawalDetailsQuery(ACCOUNT_ID, 'op-1', SUPPORT),
    );

    expect(result).toMatchObject({ operationId: 'op-1', amountMinor: 200 });
    expect(writer.records).toHaveLength(1);
    expect(writer.records[0]).toMatchObject({
      action: 'withdrawal-lookup-by-operation',
      outcome: 'success',
      actorId: 'staff-1',
      caseId: 'CASE-1',
      resultCount: 1,
    });
  });

  it('writes a rejected row for a missing withdrawal and still returns the not-found error', async () => {
    const writer = new InMemoryAuditWriter();
    const handler = new GetWithdrawalDetailsHandler(
      storeWith([withdrawal]),
      new SupportLookupAuditor(writer),
    );

    await expect(
      handler.execute(new GetWithdrawalDetailsQuery(ACCOUNT_ID, 'op-missing', SUPPORT)),
    ).rejects.toMatchObject({ code: 'WITHDRAWAL_NOT_FOUND' });

    expect(writer.records).toHaveLength(1);
    expect(writer.records[0]).toMatchObject({ outcome: 'rejected', reasonCode: 'WITHDRAWAL_NOT_FOUND' });
  });

  it('withholds the withdrawal when the audit row cannot be written', async () => {
    const handler = new GetWithdrawalDetailsHandler(
      storeWith([withdrawal]),
      new SupportLookupAuditor(new FailingAuditWriter()),
    );

    await expect(
      handler.execute(new GetWithdrawalDetailsQuery(ACCOUNT_ID, 'op-1', SUPPORT)),
    ).rejects.toMatchObject({ code: 'AUDIT_UNAVAILABLE' });
  });

  it('audits a malformed account id as INVALID_ACCOUNT_ID and keeps the 400-mapped error', async () => {
    const writer = new InMemoryAuditWriter();
    const handler = new GetWithdrawalDetailsHandler(
      storeWith([withdrawal]),
      new SupportLookupAuditor(writer),
    );

    const failure = await handler
      .execute(new GetWithdrawalDetailsQuery('not-a-uuid', 'op-1', SUPPORT))
      .catch((error: unknown) => error);

    expect(isEventSourcingError(failure, EventSourcingErrorCode.InvalidId)).toBe(true);
    expect(writer.records).toHaveLength(1);
    expect(writer.records[0]).toMatchObject({
      outcome: 'rejected',
      reasonCode: 'INVALID_ACCOUNT_ID',
      accountId: 'not-a-uuid',
    });
  });

  it('refuses a lookup without an audit context before reading the store', async () => {
    const store = storeWith([withdrawal]);
    const handler = new GetWithdrawalDetailsHandler(
      store,
      new SupportLookupAuditor(new InMemoryAuditWriter()),
    );

    await expect(
      handler.execute(
        new GetWithdrawalDetailsQuery(ACCOUNT_ID, 'op-1', undefined as unknown as SupportAuditContext),
      ),
    ).rejects.toThrow(/requires an audit context/);
    expect(store.reads).toBe(0);
  });
});
