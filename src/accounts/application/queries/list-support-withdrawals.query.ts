import {
  EventStore,
  Query,
  QueryHandler,
  type IQueryHandler,
} from '@ocoda/event-sourcing';
import {
  FutureDateError,
  InvalidDateError,
  InvalidDateRangeError,
  InvalidPageSizeError,
  type DomainError,
} from '../../../shared/domain-errors.js';
import {
  resolveDateRange,
  type DateRangeFailure,
} from '../../../shared/date-range.js';
import { resolvePageSize } from '../../../shared/page-params.js';
import {
  GetWithdrawalHistoryHandler,
  GetWithdrawalHistoryQuery,
  type WithdrawalHistoryPage,
} from './get-withdrawal-history.query.js';

/**
 * Raw request values, unvalidated, as a future route would pass them. The
 * handler validates them before it reads the store.
 */
export class ListSupportWithdrawalsQuery extends Query<WithdrawalHistoryPage> {
  constructor(
    public readonly accountId: string,
    public readonly from?: string,
    public readonly to?: string,
    public readonly pageSize?: string | number,
    public readonly beforeVersion?: number | null,
    public readonly afterVersion?: number | null,
  ) {
    super();
  }
}

/**
 * Every value is supplied by the caller. The tolerance and the lookback are
 * client-side decisions that are still OPEN or PROVISIONAL, so no default is
 * built in here.
 */
export interface SupportWithdrawalLookupOptions {
  /** Injected clock, so the result never depends on when the code runs. */
  clock: () => Date;
  /** Allowed clock skew for future-date checks, in milliseconds. OPEN. */
  clockToleranceMs: number;
  /** Lookback used only when both bounds are omitted. 90 is PROVISIONAL. */
  defaultLookbackDays: number;
  /** Page size used when none is given. 20 is PROVISIONAL. */
  defaultPageSize: number;
  /** Largest page size; larger requests are capped. 100 is a simulated decision. */
  maxPageSize: number;
}

/** Maps a date failure to the codes approved at gate G3. */
function toDomainError(failure: DateRangeFailure): DomainError {
  if (failure.reason === 'reversed' || failure.field === undefined) {
    return new InvalidDateRangeError();
  }
  if (failure.reason === 'future-from' || failure.reason === 'future-to') {
    return new FutureDateError(failure.field);
  }
  return new InvalidDateError(failure.field, failure.reason);
}

/**
 * Internal support lookup of one account's successful withdrawals in a date
 * range. Validates the range and page size, then reuses the withdrawal history
 * read, so the scan logic is not duplicated.
 *
 * Not registered in any module and not exposed by a route. The route, the
 * required case ID, authentication, authorization and audit are blocked
 * (WH-03, WH-04, SEC-01).
 */
@QueryHandler(ListSupportWithdrawalsQuery)
export class ListSupportWithdrawalsHandler implements IQueryHandler<ListSupportWithdrawalsQuery> {
  private readonly history: GetWithdrawalHistoryHandler;

  constructor(
    eventStore: EventStore,
    private readonly options: SupportWithdrawalLookupOptions,
  ) {
    this.history = new GetWithdrawalHistoryHandler(eventStore);
  }

  async execute({
    accountId,
    from,
    to,
    pageSize,
    beforeVersion,
    afterVersion,
  }: ListSupportWithdrawalsQuery): Promise<WithdrawalHistoryPage> {
    const range = resolveDateRange(
      { from, to },
      {
        now: this.options.clock(),
        clockToleranceMs: this.options.clockToleranceMs,
        defaultLookbackDays: this.options.defaultLookbackDays,
      },
    );
    if (!range.ok) throw toDomainError(range);

    const size = resolvePageSize(pageSize, {
      defaultSize: this.options.defaultPageSize,
      maxSize: this.options.maxPageSize,
    });
    if (!size.ok) throw new InvalidPageSizeError(size.reason);

    return this.history.execute(
      new GetWithdrawalHistoryQuery(
        accountId,
        range.range,
        size.pageSize,
        beforeVersion,
        afterVersion,
      ),
    );
  }
}
