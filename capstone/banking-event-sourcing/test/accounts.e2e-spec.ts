import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AccountId } from '../src/accounts/domain/account-id.js';
import { AccountRepository } from '../src/accounts/infrastructure/account.repository.js';
import { loadConfig } from '../src/config/env.js';
import { ConcurrencyConflictError } from '../src/shared/domain-errors.js';

/*
 * Runs against the real Postgres test database (docker compose up -d).
 * Each test uses fresh account ids, so no cleanup is needed between tests.
 */
describe('Accounts with the Postgres event store', () => {
  let app: INestApplication<App>;
  let db: pg.Pool;

  async function startApp(): Promise<INestApplication<App>> {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    }).compile();
    const instance = moduleRef.createNestApplication<INestApplication<App>>();
    await instance.init();
    return instance;
  }

  beforeAll(async () => {
    db = new pg.Pool({ connectionString: loadConfig().databaseUrl });
    app = await startApp();
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  const http = () => request(app.getHttpServer());

  async function openAndDeposit(amountMinor: number): Promise<string> {
    const opened = await http().post('/accounts').send({ ownerName: 'Ada' }).expect(201);
    const accountId: string = opened.body.accountId;
    await http()
      .post(`/accounts/${accountId}/deposits`)
      .send({ amountMinor, operationId: 'op-1' })
      .expect(200);
    return accountId;
  }

  it('persists each event as one row in the account stream', async () => {
    const accountId = await openAndDeposit(1050);

    const { rows } = await db.query(
      `SELECT stream_id, version, event, payload, aggregate_id, global_position
         FROM events WHERE stream_id = $1 ORDER BY version`,
      [`account-${accountId}`],
    );

    expect(rows.map((r) => [r.version, r.event])).toEqual([
      [1, 'account-opened'],
      [2, 'money-deposited'],
    ]);
    expect(rows[0].payload).toEqual({ accountId, ownerName: 'Ada', currency: 'EUR' });
    expect(rows[1].payload).toEqual({ accountId, amountMinor: 1050, operationId: 'op-1' });
    expect(rows.every((r) => r.aggregate_id === accountId)).toBe(true);
    // Events of one append get consecutive global positions.
    expect(BigInt(rows[1].global_position)).toBeGreaterThan(BigInt(rows[0].global_position));
  });

  it('rejects a save based on a stale version (optimistic concurrency)', async () => {
    const accountId = AccountId.from(await openAndDeposit(100));
    const repository = app.get(AccountRepository);

    // Two writers load the same version...
    const first = await repository.getById(accountId);
    const second = await repository.getById(accountId);
    first.deposit(10, 'op-a');
    second.deposit(20, 'op-b');

    // ...the first save wins, the second must not overwrite it.
    await repository.save(first);
    await expect(repository.save(second)).rejects.toBeInstanceOf(ConcurrencyConflictError);

    const reloaded = await repository.getById(accountId);
    expect(reloaded.balanceMinor).toBe(110);
    expect(reloaded.version).toBe(3);
  });

  it('rebuilds state by replaying the stream after an application restart', async () => {
    const accountId = await openAndDeposit(700);

    await app.close();
    app = await startApp();

    const state = await http().get(`/accounts/${accountId}`).expect(200);
    expect(state.body).toMatchObject({ balanceMinor: 700, version: 2 });
  });
});
