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

  /*
   * Global, because the audited handlers live in AccountsModule while the
   * module itself is chosen by AppModule.register. This is how Ocoda's own
   * EventSourcingModule.forRoot reaches those handlers too. Importing it again
   * from AccountsModule instead would build a second writer (a second pool) and
   * would bypass the `forWriter` writer the HTTP specs pass in.
   *
   * Only the auditor is exported. The writer stays internal, so no other module
   * can append audit rows without going through the fail-closed auditor.
   */
  private static build(writerProvider: Provider): DynamicModule {
    return {
      module: AuditModule,
      global: true,
      providers: [writerProvider, SupportLookupAuditor, AuditTableInitializer],
      exports: [SupportLookupAuditor],
    };
  }
}
