import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditModule } from './audit.module.js';
import { AuditWriter } from './audit-writer.js';
import { InMemoryAuditWriter } from './in-memory-audit-writer.js';
import { SupportLookupAuditor } from './support-lookup-auditor.js';

/*
 * A feature module that never imports the audit module, as AccountsModule does
 * not. Explicit @Inject tokens keep the probes independent of decorator metadata.
 */
@Injectable()
class NeedsAuditor {
  constructor(@Inject(SupportLookupAuditor) readonly auditor: SupportLookupAuditor) {}
}

@Module({ providers: [NeedsAuditor] })
class FeatureWithAuditor {}

@Injectable()
class NeedsWriter {
  constructor(@Inject(AuditWriter) readonly writer: AuditWriter) {}
}

@Module({ providers: [NeedsWriter] })
class FeatureWithWriter {}

describe('AuditModule wiring', () => {
  it('gives a sibling feature module the auditor, backed by the writer the app chose', async () => {
    const writer = new InMemoryAuditWriter();
    const moduleRef = await Test.createTestingModule({
      imports: [AuditModule.forWriter(writer), FeatureWithAuditor],
    }).compile();

    await moduleRef
      .get(NeedsAuditor)
      .auditor.run(
        { actorId: 'staff-1', caseId: null, note: null },
        { accountId: 'acc-1', action: 'withdrawal-lookup-by-operation', query: {} },
        async () => 'ok',
        () => 1,
      );

    expect(writer.records).toHaveLength(1);
    expect(moduleRef.get(AuditWriter)).toBe(writer);
  });

  it('keeps the writer internal: a sibling feature module cannot inject it', async () => {
    await expect(
      Test.createTestingModule({
        imports: [AuditModule.forWriter(new InMemoryAuditWriter()), FeatureWithWriter],
      }).compile(),
    ).rejects.toThrow(/AuditWriter/);
  });
});
