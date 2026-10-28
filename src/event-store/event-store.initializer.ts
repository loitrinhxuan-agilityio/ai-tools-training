import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { EventStore } from '@ocoda/event-sourcing';

/**
 * The Postgres store creates its `events` table only when asked
 * (`ensureCollection`, with `ddl: 'auto'`). Doing it at bootstrap makes a
 * fresh database usable; on an existing table it only registers it.
 */
@Injectable()
export class EventStoreInitializer implements OnApplicationBootstrap {
  constructor(private readonly eventStore: EventStore) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.eventStore.ensureCollection();
  }
}
