import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { loadAuditWriteTimeoutMs, loadConfig } from '../config/env.js';
import { AuditTableInitializer } from './audit-table.initializer.js';
import { AuditWriter } from './audit-writer.js';
import { PgAuditWriter } from './pg-audit-writer.js';
import { SupportLookupAuditor } from './support-lookup-auditor.js';

/**
 * Registers the audit writer and the support lookup auditor. `forRoot` writes
 * to PostgreSQL (DATABASE_URL, AUDIT_WRITE_TIMEOUT_MS). `forWriter` takes a
 * writer directly and is for tests.
 */
@Module({})
export class AuditModule {
  static forRoot(): DynamicModule {
    return AuditModule.build({
      provide: AuditWriter,
      useFactory: () =>
        new PgAuditWriter(loadConfig().databaseUrl, loadAuditWriteTimeoutMs()),
    });
  }

  static forWriter(writer: AuditWriter): DynamicModule {
    return AuditModule.build({ provide: AuditWriter, useValue: writer });
  }

  private static build(writerProvider: Provider): DynamicModule {
    return {
      module: AuditModule,
      providers: [writerProvider, SupportLookupAuditor, AuditTableInitializer],
      exports: [AuditWriter, SupportLookupAuditor],
    };
  }
}
