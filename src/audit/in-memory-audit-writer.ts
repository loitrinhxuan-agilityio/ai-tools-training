import type { AuditRecord } from './audit-record.js';
import { AuditWriter } from './audit-writer.js';

/** Keeps audit rows in memory. For unit and HTTP tests only. */
export class InMemoryAuditWriter extends AuditWriter {
  readonly records: AuditRecord[] = [];

  async ensureTable(): Promise<void> {}

  async write(record: AuditRecord): Promise<void> {
    this.records.push(record);
  }
}
