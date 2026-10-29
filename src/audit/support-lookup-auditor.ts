import { Injectable } from '@nestjs/common';
import { EventSourcingErrorCode, isEventSourcingError } from '@ocoda/event-sourcing';
import {
  AuditUnavailableError,
  DomainError,
} from '../shared/domain-errors.js';
import type { AuditAction, AuditRecord } from './audit-record.js';
import { AuditWriter } from './audit-writer.js';

/** Who is looking up, and why. Supplied by the caller; validated by the lookup rules. */
export interface SupportAuditContext {
  /** The token's `sub`. */
  actorId: string;
  caseId: string | null;
  note: string | null;
}

export interface SupportLookupDetails {
  accountId: string;
  action: AuditAction;
  /** The lookup parameters as received. */
  query: Record<string, unknown>;
}

/** Reason code for a read that failed for a reason other than a business rule. */
export const READ_FAILED_REASON = 'READ_FAILED';

/**
 * Reason code for a malformed account id. Not a DomainError, so it is named here.
 * The HTTP response is still the filter's 400 INVALID_ID.
 */
export const INVALID_ACCOUNT_ID_REASON = 'INVALID_ACCOUNT_ID';

/** The audit reason for a failed read: a business rule, a malformed id, or anything else. */
function reasonFor(error: unknown): string {
  if (error instanceof DomainError) return error.code;
  if (isEventSourcingError(error, EventSourcingErrorCode.InvalidId)) {
    return INVALID_ACCOUNT_ID_REASON;
  }
  return READ_FAILED_REASON;
}

/**
 * Runs one support lookup with fail-closed auditing (WH-04, W3):
 *  - the read runs first;
 *  - a successful read writes a `success` row with its result count, then returns;
 *  - a DomainError (rejected lookup) writes a `rejected` row with its code, then rethrows it;
 *  - a malformed account id writes a `rejected` row with reason `INVALID_ACCOUNT_ID`,
 *    then rethrows the id error unchanged (the filter maps it to 400);
 *  - any other read failure (e.g. the event store is down) writes a `rejected` row
 *    with reason `READ_FAILED`, then rethrows it. The outcome set stays as approved (W2);
 *  - if an audit write fails, the caller gets AuditUnavailableError and no data.
 *
 * Known residual risk (decided, see the WH-04 notes): a write that times out may
 * still commit on the server. Its caller then gets 503 while the row says `success`.
 * The row records that the read completed, not that the data was delivered.
 */
@Injectable()
export class SupportLookupAuditor {
  constructor(private readonly writer: AuditWriter) {}

  async run<T>(
    context: SupportAuditContext,
    details: SupportLookupDetails,
    read: () => Promise<T>,
    resultCount: (value: T) => number,
  ): Promise<T> {
    let value: T;
    try {
      value = await read();
    } catch (error) {
      await this.record(context, details, 'rejected', reasonFor(error), null);
      throw error;
    }

    await this.record(context, details, 'success', null, resultCount(value));
    return value;
  }

  private async record(
    context: SupportAuditContext,
    details: SupportLookupDetails,
    outcome: AuditRecord['outcome'],
    reasonCode: string | null,
    resultCount: number | null,
  ): Promise<void> {
    const record: AuditRecord = {
      occurredAt: new Date(),
      actorType: 'support',
      actorId: context.actorId,
      accountId: details.accountId,
      action: details.action,
      outcome,
      reasonCode,
      query: details.query,
      caseId: context.caseId,
      note: context.note,
      resultCount,
    };
    try {
      await this.writer.write(record);
    } catch {
      throw new AuditUnavailableError();
    }
  }
}
