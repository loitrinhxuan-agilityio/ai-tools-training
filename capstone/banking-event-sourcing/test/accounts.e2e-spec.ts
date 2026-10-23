import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { vi } from 'vitest';
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

  async function openAndDepositWithKey(amountMinor: number): Promise<string> {
    const opened = await http().post('/accounts').send({ ownerName: 'Ada' }).expect(201);
    const accountId: string = opened.body.accountId;
    await http()
      .post(`/accounts/${accountId}/deposits`)
      .send({ amountMinor, operationId: 'dep-1' })
      .expect(200);
    return accountId;
  }

  /*
   * Holds the first two loads of `getById` until both have finished, so two
   * requests see the same version before either saves. Also releases on a load
   * error or after a timeout, so a request that fails before the barrier cannot
   * hang the test. The returned function restores the spy.
   */
  function holdBothLoadsBeforeSave(repository: AccountRepository): () => void {
    const loadRepository = repository.getById.bind(repository);
    let loads = 0;
    let releaseBoth!: () => void;
    const bothLoaded = new Promise<void>((resolve) => (releaseBoth = resolve));
    // Shorter than Vitest's default 5000 ms test timeout, so a missing load
    // fails with the assertion below instead of a timeout.
    const releaseTimer = setTimeout(releaseBoth, 1000);
    const spy = vi.spyOn(repository, 'getById').mockImplementation(async (id) => {
      const account = await loadRepository(id).catch((error: unknown) => {
        releaseBoth();
        throw error;
      });
      loads += 1;
      if (loads === 2) releaseBoth();
      await bothLoaded;
      return account;
    });
    return () => {
      clearTimeout(releaseTimer);
      spy.mockRestore();
    };
  }

  it('persists a withdrawal as a money-withdrawn row with the expected payload', async () => {
    const accountId = await openAndDepositWithKey(1000);
    await http()
      .post(`/accounts/${accountId}/withdrawals`)
      .send({ amountMinor: 400, operationId: 'wd-1' })
      .expect(200);

    const { rows } = await db.query(
      `SELECT version, event, payload FROM events WHERE stream_id = $1 ORDER BY version`,
      [`account-${accountId}`],
    );

    expect(rows.map((r) => [r.version, r.event])).toEqual([
      [1, 'account-opened'],
      [2, 'money-deposited'],
      [3, 'money-withdrawn'],
    ]);
    expect(rows[2].payload).toEqual({ accountId, amountMinor: 400, operationId: 'wd-1' });
  });

  it('does not persist a rejected withdrawal (insufficient funds)', async () => {
    const accountId = await openAndDepositWithKey(100);

    await http()
      .post(`/accounts/${accountId}/withdrawals`)
      .send({ amountMinor: 101, operationId: 'wd-1' })
      .expect(422);

    const { rows } = await db.query(
      `SELECT version FROM events WHERE stream_id = $1 ORDER BY version`,
      [`account-${accountId}`],
    );
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
  });

  it('rejects the second of two stale withdrawals that together overdraw the account', async () => {
    const accountId = AccountId.from(await openAndDepositWithKey(1000));
    const repository = app.get(AccountRepository);

    const first = await repository.getById(accountId);
    const second = await repository.getById(accountId);
    // Each alone is within the balance; together they would overdraw it.
    first.withdraw(600, 'wd-a');
    second.withdraw(600, 'wd-b');

    await repository.save(first);
    await expect(repository.save(second)).rejects.toBeInstanceOf(ConcurrencyConflictError);

    const reloaded = await repository.getById(accountId);
    expect(reloaded.balanceMinor).toBe(400);
    expect(reloaded.version).toBe(3);
  });

  it('gives the losing HTTP writer 409 CONCURRENCY_CONFLICT when both loaded the same version', async () => {
    const accountId = await openAndDepositWithKey(1000);
    const repository = app.get(AccountRepository);

    // Both requests must see balance 1000 before either saves. Without the
    // barrier, the requests can run one after another and the loser gets
    // 422 INSUFFICIENT_FUNDS instead of the conflict path.
    const restore = holdBothLoadsBeforeSave(repository);
    try {
      const [a, b] = await Promise.all([
        http().post(`/accounts/${accountId}/withdrawals`).send({ amountMinor: 600, operationId: 'wd-a' }),
        http().post(`/accounts/${accountId}/withdrawals`).send({ amountMinor: 600, operationId: 'wd-b' }),
      ]);

      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 409]);
      const loser = a.status === 409 ? a : b;
      expect(loser.body).toMatchObject({ statusCode: 409, code: 'CONCURRENCY_CONFLICT' });
    } finally {
      restore();
    }

    const state = await http().get(`/accounts/${accountId}`).expect(200);
    expect(state.body).toMatchObject({ balanceMinor: 400, version: 3 });
  });

  it('answers a same-key retry that loses the append race with duplicate, not a conflict', async () => {
    const accountId = await openAndDepositWithKey(1000);
    const repository = app.get(AccountRepository);

    const restore = holdBothLoadsBeforeSave(repository);
    try {
      const [a, b] = await Promise.all([
        http().post(`/accounts/${accountId}/withdrawals`).send({ amountMinor: 600, operationId: 'wd-same' }),
        http().post(`/accounts/${accountId}/withdrawals`).send({ amountMinor: 600, operationId: 'wd-same' }),
      ]);

      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect([a.body.status, b.body.status].sort((x, y) => x.localeCompare(y))).toEqual([
        'duplicate',
        'withdrawn',
      ]);
      expect(a.body.balanceMinor).toBe(400);
      expect(b.body.balanceMinor).toBe(400);
    } finally {
      restore();
    }

    // Only one money-withdrawn event was appended.
    const state = await http().get(`/accounts/${accountId}`).expect(200);
    expect(state.body).toMatchObject({ balanceMinor: 400, version: 3 });
  });

  it('keeps the withdrawal balance and idempotency keys after an application restart', async () => {
    const accountId = await openAndDepositWithKey(1000);
    await http()
      .post(`/accounts/${accountId}/withdrawals`)
      .send({ amountMinor: 400, operationId: 'wd-1' })
      .expect(200);

    await app.close();
    app = await startApp();

    const state = await http().get(`/accounts/${accountId}`).expect(200);
    expect(state.body).toMatchObject({ balanceMinor: 600, version: 3 });

    const retry = await http()
      .post(`/accounts/${accountId}/withdrawals`)
      .send({ amountMinor: 400, operationId: 'wd-1' })
      .expect(200);
    expect(retry.body).toMatchObject({ status: 'duplicate', balanceMinor: 600 });

    const crossType = await http()
      .post(`/accounts/${accountId}/withdrawals`)
      .send({ amountMinor: 1000, operationId: 'dep-1' })
      .expect(409);
    expect(crossType.body.code).toBe('OPERATION_ID_REUSED');

    const after = await http().get(`/accounts/${accountId}`).expect(200);
    expect(after.body.balanceMinor).toBe(600);
  });
});
