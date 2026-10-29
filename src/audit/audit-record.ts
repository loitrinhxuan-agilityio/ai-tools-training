/** Who performed the lookup. Customer is added with customer identity (B1). */
export type AuditActorType = 'support';

/** One row per attempt (W2). */
export type AuditOutcome = 'success' | 'denied' | 'rejected';

export type AuditAction = 'withdrawal-lookup-by-operation' | 'withdrawal-lookup-by-range';

export interface AuditRecord {
  occurredAt: Date;
  actorType: AuditActorType;
  /** The token's `sub` (SEC-01 caller ID). */
  actorId: string;
  accountId: string;
  action: AuditAction;
  outcome: AuditOutcome;
  /** The DomainError code for a rejected attempt; null otherwise. */
  reasonCode: string | null;
  /** The lookup parameters as received, stored as JSON. */
  query: Record<string, unknown>;
  caseId: string | null;
  note: string | null;
  /** Number of withdrawals returned; 0 for an empty result (W4). Null when nothing was returned. */
  resultCount: number | null;
}
