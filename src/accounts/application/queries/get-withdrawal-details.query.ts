import {
  EventStore,
  EventStream,
  Query,
  QueryHandler,
  type IQueryHandler,
} from '@ocoda/event-sourcing';
import {
  SupportLookupAuditor,
  type SupportAuditContext,
} from '../../../audit/support-lookup-auditor.js';
import {
  AccountNotFoundError,
  WithdrawalNotFoundError,
} from '../../../shared/domain-errors.js';
import { AccountId } from '../../domain/account-id.js';
import { Account } from '../../domain/account.aggregate.js';

/** Event name declared by `MoneyWithdrawnEvent` in `account.events.ts`. */
const WITHDRAWN_EVENT = 'money-withdrawn';

/** Payload fields of `MoneyWithdrawnEvent`. The timestamp is not in the payload. */
interface WithdrawnPayload {
  amountMinor: number;
  operationId: string;
}

export interface WithdrawalDetailsDto {
  operationId: string;
  /**
   * Internal name. The API field name (`amount` or `amountMinor`) is OPEN and
   * is not decided by this handler.
   */
  amountMinor: number;
  /** From the stored envelope (`metadata.occurredOn`), not the payload. */
  occurredOn: Date;
  status: 'succeeded';
}

export class GetWithdrawalDetailsQuery extends Query<WithdrawalDetailsDto> {
  constructor(
    public readonly accountId: string,
    public readonly operationId: string,
    /** Who is looking up, with the case ID and note. Recorded in the audit row. */
    public readonly audit: SupportAuditContext,
  ) {
    super();
  }
}

/**
 * Finds one successful withdrawal in the account's stream by its operationId.
 * Failed attempts are never stored, so they cannot match. Deposits share the
 * operationId namespace, so only `money-withdrawn` envelopes are considered.
 * Scans the stream, like the other queries, until Phase 3 adds a projection.
 *
 * The lookup is audited and fails closed (WH-04): no data is returned unless
 * its audit row was written.
 */
@QueryHandler(GetWithdrawalDetailsQuery)
export class GetWithdrawalDetailsHandler implements IQueryHandler<GetWithdrawalDetailsQuery> {
  constructor(
    private readonly eventStore: EventStore,
    private readonly auditor: SupportLookupAuditor,
  ) {}

  async execute(query: GetWithdrawalDetailsQuery): Promise<WithdrawalDetailsDto> {
    // Without a caller, no read may proceed: a lookup must always be audited.
    if (!query.audit) throw new Error('GetWithdrawalDetailsQuery requires an audit context');
    return this.auditor.run(
      query.audit,
      {
        accountId: query.accountId,
        action: 'withdrawal-lookup-by-operation',
        query: { operationId: query.operationId },
      },
      () => this.find(query.accountId, query.operationId),
      () => 1,
    );
  }

  private async find(
    accountId: string,
    operationId: string,
  ): Promise<WithdrawalDetailsDto> {
    const id = AccountId.from(accountId);
    const stream = EventStream.for(Account, id);
    let streamHasEvents = false;

    for await (const batch of this.eventStore.getEnvelopes(stream)) {
      for (const envelope of batch) {
        streamHasEvents = true;
        if (envelope.event !== WITHDRAWN_EVENT) continue;

        const payload = envelope.payload as unknown as WithdrawnPayload;
        if (payload.operationId === operationId) {
          return {
            operationId,
            amountMinor: payload.amountMinor,
            occurredOn: envelope.metadata.occurredOn,
            status: 'succeeded',
          };
        }
      }
    }

    if (!streamHasEvents) throw new AccountNotFoundError(id.value);
    throw new WithdrawalNotFoundError(id.value, operationId);
  }
}
