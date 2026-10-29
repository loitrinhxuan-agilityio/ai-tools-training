import { type DynamicModule, Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { EventSourcingModule } from '@ocoda/event-sourcing';
import {
  PostgresEventStore,
  type PostgresEventStoreConfig,
} from '@ocoda/event-sourcing-postgres';
import { AccountsModule } from './accounts/accounts.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { loadConfig } from './config/env.js';
import { EventStoreInitializer } from './event-store/event-store.initializer.js';
import { DomainExceptionFilter } from './shared/domain-exception.filter.js';

/**
 * Root module. `eventSourcing`, `auth` and `audit` are injectable so tests can
 * swap the Postgres store for Ocoda's in-memory default, use a test signing key,
 * and keep audit rows in memory.
 */
@Module({})
export class AppModule {
  static register(
    eventSourcing: DynamicModule = AppModule.postgresEventSourcing(),
    auth: DynamicModule = AuthModule.forRoot(),
    audit: DynamicModule = AuditModule.forRoot(),
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [eventSourcing, auth, audit, AccountsModule],
      providers: [
        EventStoreInitializer,
        { provide: APP_FILTER, useClass: DomainExceptionFilter },
        {
          provide: APP_PIPE,
          useValue: new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
          }),
        },
      ],
    };
  }

  static postgresEventSourcing(): DynamicModule {
    return EventSourcingModule.forRootAsync<PostgresEventStoreConfig>({
      useFactory: () => ({
        eventStore: {
          driver: PostgresEventStore,
          connectionString: loadConfig().databaseUrl,
          ddl: 'auto',
        },
      }),
    });
  }
}
