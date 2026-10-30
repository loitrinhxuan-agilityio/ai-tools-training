import type { AuditRecord } from './audit-record.js';

/**
 * Port for audit storage. Implementations must reject, not swallow, a write
 * they could not complete; the caller turns that into a fail-closed response.
 */
export abstract class AuditWriter {
  /** Creates the audit table if it is missing. Runs once at startup. */
  abstract ensureTable(): Promise<void>;

  abstract write(record: AuditRecord): Promise<void>;

  /** Releases storage resources at shutdown. */
  async close(): Promise<void> {}
}
