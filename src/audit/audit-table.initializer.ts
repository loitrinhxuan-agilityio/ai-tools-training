import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AuditWriter } from './audit-writer.js';

/**
 * Creates the audit table at startup, next to EventStoreInitializer, since no
 * migration tooling exists. Closes the writer's connections at shutdown.
 */
@Injectable()
export class AuditTableInitializer implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(private readonly writer: AuditWriter) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.writer.ensureTable();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.writer.close();
  }
}
