import { Injectable } from '@nestjs/common';
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
 * Runs one support lookup with fail-closed auditing (WH-04, W3):
 *  - the read runs first;
 *  - a successful read writes a `success` row with its result count, then returns;
 *  - a DomainError (rejected lookup) writes a `rejected` row with its code, then rethrows it;
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
      const reason = error instanceof DomainError ? error.code : READ_FAILED_REASON;
      await this.record(context, details, 'rejected', reason, null);
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
