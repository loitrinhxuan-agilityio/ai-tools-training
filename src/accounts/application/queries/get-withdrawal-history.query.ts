import {
  EventStore,
  EventStream,
  Query,
  QueryHandler,
  type IQueryHandler,
} from '@ocoda/event-sourcing';
import { AccountNotFoundError } from '../../../shared/domain-errors.js';
import type { ResolvedDateRange } from '../../../shared/date-range.js';
import { AccountId } from '../../domain/account-id.js';
import { Account } from '../../domain/account.aggregate.js';

/** Event name declared by `MoneyWithdrawnEvent` in `account.events.ts`. */
const WITHDRAWN_EVENT = 'money-withdrawn';

/** Payload fields of `MoneyWithdrawnEvent`. The timestamp is not in the payload. */
interface WithdrawnPayload {
  amountMinor: number;
  operationId: string;
}

export interface WithdrawalHistoryItem {
  version: number;
  operationId: string;
  /**
   * Internal name. The API field name (`amount` or `amountMinor`) is OPEN and
   * is not decided by this handler.
   */
  amountMinor: number;
  /** From the stored envelope (`metadata.occurredOn`), not the payload. */
  occurredOn: Date;
}

export interface WithdrawalHistoryPage {
  /** Newest first, one page. */
  items: WithdrawalHistoryItem[];
  /**
   * Pass as `beforeVersion` to read the next, older page. Null when no older
   * withdrawal exists. This is an internal position, not the API cursor, whose
   * encoding and transport are OPEN.
   */
  nextBeforeVersion: number | null;
  /**
   * Pass as `afterVersion` to read the previous, newer page. Null when no newer
   * withdrawal exists. ENG PROPOSAL: the meaning of "previous" is not approved.
   */
  previousAfterVersion: number | null;
}

/**
 * The caller resolves `range` and `pageSize` with `resolveDateRange` and
 * `resolvePageSize` (src/shared), so validation happens before this query.
 * Pass at most one of `beforeVersion` (older page) and `afterVersion` (newer page).
 */
export class GetWithdrawalHistoryQuery extends Query<WithdrawalHistoryPage> {
  constructor(
    public readonly accountId: string,
    public readonly range: ResolvedDateRange,
    public readonly pageSize: number,
    /** Only withdrawals with a version strictly below this are returned. Null means absent. */
    public readonly beforeVersion?: number | null,
    /** Only withdrawals with a version strictly above this are returned. Null means absent. */
    public readonly afterVersion?: number | null,
  ) {
    super();
  }
}

function isInRange(at: Date, range: ResolvedDateRange): boolean {
  if (range.from !== null && at < range.from) return false;
  return at <= range.to;
}

/**
 * Lists one account's successful withdrawals, newest first, one page at a time.
 *
 * Reads the whole stream forward with `getEnvelopes`, then filters and pages in
 * memory. This is the simplest option the current store API supports: it does
 * not depend on `direction` or on `fromVersion` as an upper bound, which
 * `fromVersion` does not provide. Cost grows with stream length, as it does for
 * the existing replay, and has not been measured.
 */
@QueryHandler(GetWithdrawalHistoryQuery)
export class GetWithdrawalHistoryHandler implements IQueryHandler<GetWithdrawalHistoryQuery> {
  constructor(private readonly eventStore: EventStore) {}

  async execute({
    accountId,
    range,
    pageSize,
    beforeVersion: beforeInput,
    afterVersion: afterInput,
  }: GetWithdrawalHistoryQuery): Promise<WithdrawalHistoryPage> {
    // Null and undefined both mean "no cursor". Without this, a null from a
    // caller compares as 0 and returns an empty page with no error.
    const beforeVersion = beforeInput ?? undefined;
    const afterVersion = afterInput ?? undefined;
    if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
      throw new RangeError('pageSize must be a positive safe integer');
    }
    if (beforeVersion !== undefined && afterVersion !== undefined) {
      throw new RangeError('Pass beforeVersion or afterVersion, not both');
    }
    const stream = EventStream.for(Account, AccountId.from(accountId));
    const matching: WithdrawalHistoryItem[] = [];
    let hasEvents = false;

    for await (const batch of this.eventStore.getEnvelopes(stream)) {
      for (const envelope of batch) {
        hasEvents = true;
        if (envelope.event !== WITHDRAWN_EVENT) continue;

        const occurredOn = envelope.metadata.occurredOn;
        if (!isInRange(occurredOn, range)) continue;

        const payload = envelope.payload as unknown as WithdrawnPayload;
        matching.push({
          version: envelope.metadata.version,
          operationId: payload.operationId,
          amountMinor: payload.amountMinor,
          occurredOn,
        });
      }
    }

    if (!hasEvents) throw new AccountNotFoundError(accountId);

    // Versions are unique within a stream, so ordering by version is exact.
    const ascending = matching.sort((a, b) => a.version - b.version);

    // The window is the page in ascending order. `afterVersion` takes the
    // nearest withdrawals above it; otherwise the newest below `beforeVersion`.
    let window: WithdrawalHistoryItem[];
    if (afterVersion !== undefined) {
      window = ascending
        .filter((item) => item.version > afterVersion)
        .slice(0, pageSize);
    } else {
      const below =
        beforeVersion === undefined
          ? ascending
          : ascending.filter((item) => item.version < beforeVersion);
      window = below.slice(Math.max(0, below.length - pageSize));
    }

    if (window.length === 0) {
      return { items: [], nextBeforeVersion: null, previousAfterVersion: null };
    }

    const lowest = window[0].version;
    const highest = window[window.length - 1].version;

    return {
      items: [...window].reverse(),
      nextBeforeVersion: ascending.some((item) => item.version < lowest)
        ? lowest
        : null,
      previousAfterVersion: ascending.some((item) => item.version > highest)
        ? highest
        : null,
    };
  }
}
