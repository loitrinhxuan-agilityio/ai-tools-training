import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventSourcingModule } from '@ocoda/event-sourcing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../app.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { InMemoryAuditWriter } from '../audit/in-memory-audit-writer.js';
import { AuthModule } from '../auth/auth.module.js';
import { INTERNAL_SUPPORT_ROLE } from '../auth/roles.js';
import { TEST_JWT_SECRET, signTestToken } from '../../test/support/test-tokens.js';

/*
 * Full command/query flow through HTTP, using Ocoda's in-memory event store
 * (the default when no `eventStore` is configured). Fast and DB-free; the
 * Postgres behaviour is covered in test/*.e2e-spec.ts. Every request carries
 * an internal-role token; refusals are covered in accounts.auth.http.spec.ts.
 */
describe('Accounts HTTP flow (in-memory event store)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.register(
          EventSourcingModule.forRoot({}),
          AuthModule.forSecret(TEST_JWT_SECRET),
          AuditModule.forWriter(new InMemoryAuditWriter()),
        ),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const token = signTestToken({ role: INTERNAL_SUPPORT_ROLE });
  const http = () => {
    const agent = request(app.getHttpServer());
    return {
      get: (url: string) => agent.get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string) => agent.post(url).set('Authorization', `Bearer ${token}`),
    };
  };

  async function openAccount(): Promise<string> {
    const res = await http().post('/accounts').send({ ownerName: 'Ada' }).expect(201);
    return res.body.accountId;
  }

  it('opens an account and deposits money', async () => {
    const accountId = await openAccount();

    const deposit = await http()
      .post(`/accounts/${accountId}/deposits`)
      .send({ amountMinor: 1050, operationId: 'op-1' })
      .expect(200);
    expect(deposit.body).toEqual({
      accountId,
      operationId: 'op-1',
      status: 'deposited',
      balanceMinor: 1050,
    });

    const state = await http().get(`/accounts/${accountId}`).expect(200);
    expect(state.body).toEqual({
      accountId,
      ownerName: 'Ada',
      currency: 'EUR',
      balanceMinor: 1050,
      version: 2,
    });
  });

  it('finds the same account when the id is sent in uppercase', async () => {
    const accountId = await openAccount();
    const upper = accountId.toUpperCase();

    await http()
      .post(`/accounts/${upper}/deposits`)
      .send({ amountMinor: 700, operationId: 'op-1' })
      .expect(200);

    const state = await http().get(`/accounts/${upper}`).expect(200);
    expect(state.body).toMatchObject({ accountId, balanceMinor: 700 });

    const deposit = await http().get(`/accounts/${upper}/deposits/op-1`).expect(200);
    expect(deposit.body).toEqual({ accountId, operationId: 'op-1', amountMinor: 700 });
  });

  it('returns the event history in stream order', async () => {
    const accountId = await openAccount();
    await http()
      .post(`/accounts/${accountId}/deposits`)
      .send({ amountMinor: 500, operationId: 'op-1' })
      .expect(200);

    const res = await http().get(`/accounts/${accountId}/events`).expect(200);

    expect(res.body.map((e: { event: string; version: number }) => [e.event, e.version])).toEqual([
      ['account-opened', 1],
      ['money-deposited', 2],
    ]);
    expect(res.body[1].payload).toEqual({
      accountId,
      amountMinor: 500,
      operationId: 'op-1',
    });
  });

  it('makes a retried deposit a no-op', async () => {
    const accountId = await openAccount();
    const body = { amountMinor: 500, operationId: 'op-1' };

    await http().post(`/accounts/${accountId}/deposits`).send(body).expect(200);
    const retry = await http().post(`/accounts/${accountId}/deposits`).send(body).expect(200);

    expect(retry.body).toMatchObject({ status: 'duplicate', balanceMinor: 500 });
    const events = await http().get(`/accounts/${accountId}/events`).expect(200);
    expect(events.body).toHaveLength(2);
  });

  it('rejects reuse of an operationId with a different amount (409)', async () => {
    const accountId = await openAccount();
    await http()
      .post(`/accounts/${accountId}/deposits`)
      .send({ amountMinor: 500, operationId: 'op-1' })
      .expect(200);

    const res = await http()
      .post(`/accounts/${accountId}/deposits`)
      .send({ amountMinor: 900, operationId: 'op-1' })
      .expect(409);
    expect(res.body.code).toBe('OPERATION_ID_REUSED');
  });

  it.each([
    [{ amountMinor: 0, operationId: 'op' }],
    [{ amountMinor: -5, operationId: 'op' }],
    [{ amountMinor: 10.5, operationId: 'op' }],
    [{ amountMinor: '100', operationId: 'op' }],
    [{ amountMinor: 100 }],
    [{ amountMinor: 100, operationId: 'op', extra: true }],
  ])('rejects invalid deposit body %j (400)', async (body) => {
    const accountId = await openAccount();
    await http().post(`/accounts/${accountId}/deposits`).send(body).expect(400);
  });

  it('returns 404 for an unknown account', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    const res = await http()
      .post(`/accounts/${unknown}/deposits`)
      .send({ amountMinor: 100, operationId: 'op' })
      .expect(404);
    expect(res.body.code).toBe('ACCOUNT_NOT_FOUND');
    await http().get(`/accounts/${unknown}`).expect(404);
    await http().get(`/accounts/${unknown}/events`).expect(404);
  });

  it('returns 400 for a malformed account id', async () => {
    await http().get('/accounts/not-a-uuid').expect(400);
    await http().get('/accounts/not-a-uuid/deposits/op-1').expect(400);
  });

  describe('GET /accounts/:id/deposits/:operationId', () => {
    it('returns the deposit recorded under that operationId', async () => {
      const accountId = await openAccount();
      await http()
        .post(`/accounts/${accountId}/deposits`)
        .send({ amountMinor: 500, operationId: 'op-1' })
        .expect(200);
      await http()
        .post(`/accounts/${accountId}/deposits`)
        .send({ amountMinor: 1050, operationId: 'op-2' })
        .expect(200);

      const res = await http().get(`/accounts/${accountId}/deposits/op-2`).expect(200);

      expect(res.body).toEqual({ accountId, operationId: 'op-2', amountMinor: 1050 });
    });

    it('returns 404 ACCOUNT_NOT_FOUND for an unknown account', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000';

      const res = await http().get(`/accounts/${unknown}/deposits/op-1`).expect(404);

      expect(res.body.code).toBe('ACCOUNT_NOT_FOUND');
    });

    it('returns 404 DEPOSIT_NOT_FOUND for an unknown operationId', async () => {
      const accountId = await openAccount();
      await http()
        .post(`/accounts/${accountId}/deposits`)
        .send({ amountMinor: 500, operationId: 'op-1' })
        .expect(200);

      const res = await http().get(`/accounts/${accountId}/deposits/op-missing`).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, code: 'DEPOSIT_NOT_FOUND' });
    });

    it('accepts an operationId of exactly 100 characters', async () => {
      const accountId = await openAccount();
      const operationId = 'x'.repeat(100);
      await http()
        .post(`/accounts/${accountId}/deposits`)
        .send({ amountMinor: 500, operationId })
        .expect(200);

      const res = await http().get(`/accounts/${accountId}/deposits/${operationId}`).expect(200);

      expect(res.body).toEqual({ accountId, operationId, amountMinor: 500 });
    });

    it('returns 400 for an operationId longer than 100 characters', async () => {
      const accountId = await openAccount();

      const res = await http()
        .get(`/accounts/${accountId}/deposits/${'x'.repeat(101)}`)
        .expect(400);

      expect(res.body).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: ['operationId must be shorter than or equal to 100 characters'],
      });
    });

    it('does not match the route when operationId is empty (framework 404, not DEPOSIT_NOT_FOUND)', async () => {
      const accountId = await openAccount();

      const res = await http().get(`/accounts/${accountId}/deposits/`).expect(404);

      expect(res.body.code).toBeUndefined();
    });
  });

  describe('POST /accounts/:id/withdrawals', () => {
    async function openAndDeposit(amountMinor: number): Promise<string> {
      const accountId = await openAccount();
      await http()
        .post(`/accounts/${accountId}/deposits`)
        .send({ amountMinor, operationId: 'dep-1' })
        .expect(200);
      return accountId;
    }

    it('withdraws money and returns the new balance', async () => {
      const accountId = await openAndDeposit(1000);

      const res = await http()
        .post(`/accounts/${accountId}/withdrawals`)
        .send({ amountMinor: 400, operationId: 'wd-1' })
        .expect(200);

      expect(res.body).toEqual({
        accountId,
        operationId: 'wd-1',
        status: 'withdrawn',
        balanceMinor: 600,
      });
    });

    it('allows withdrawing the full balance', async () => {
      const accountId = await openAndDeposit(1000);

      const res = await http()
        .post(`/accounts/${accountId}/withdrawals`)
        .send({ amountMinor: 1000, operationId: 'wd-1' })
        .expect(200);

      expect(res.body).toMatchObject({ status: 'withdrawn', balanceMinor: 0 });
    });

    it('rejects an amount above the balance with 422 and writes no event', async () => {
      const accountId = await openAndDeposit(1000);

      const res = await http()
        .post(`/accounts/${accountId}/withdrawals`)
        .send({ amountMinor: 1001, operationId: 'wd-1' })
        .expect(422);
      expect(res.body).toMatchObject({ statusCode: 422, code: 'INSUFFICIENT_FUNDS' });

      const state = await http().get(`/accounts/${accountId}`).expect(200);
      expect(state.body.balanceMinor).toBe(1000);
      const events = await http().get(`/accounts/${accountId}/events`).expect(200);
      expect(events.body.map((e: { event: string }) => e.event)).toEqual([
        'account-opened',
        'money-deposited',
      ]);
    });

    it('makes a retried withdrawal a no-op even after the balance dropped', async () => {
      const accountId = await openAndDeposit(1000);
      const body = { amountMinor: 900, operationId: 'wd-1' };

      await http().post(`/accounts/${accountId}/withdrawals`).send(body).expect(200);
      const retry = await http()
        .post(`/accounts/${accountId}/withdrawals`)
        .send(body)
        .expect(200);

      expect(retry.body).toMatchObject({ status: 'duplicate', balanceMinor: 100 });
      const events = await http().get(`/accounts/${accountId}/events`).expect(200);
      expect(events.body).toHaveLength(3);
    });

    it('rejects reuse of a withdrawal operationId with a different amount (409)', async () => {
      const accountId = await openAndDeposit(1000);
      await http()
        .post(`/accounts/${accountId}/withdrawals`)
        .send({ amountMinor: 300, operationId: 'wd-1' })
        .expect(200);

      const res = await http()
        .post(`/accounts/${accountId}/withdrawals`)
        .send({ amountMinor: 200, operationId: 'wd-1' })
        .expect(409);
      expect(res.body.code).toBe('OPERATION_ID_REUSED');
    });

    it('rejects a deposit key reused by a withdrawal (409), leaving the balance unchanged', async () => {
      const accountId = await openAndDeposit(1000);

      const res = await http()
        .post(`/accounts/${accountId}/withdrawals`)
        .send({ amountMinor: 1000, operationId: 'dep-1' })
        .expect(409);
      expect(res.body.code).toBe('OPERATION_ID_REUSED');

      const state = await http().get(`/accounts/${accountId}`).expect(200);
      expect(state.body.balanceMinor).toBe(1000);
    });

    it('returns 409, not 422, for a reused key whose amount exceeds the balance', async () => {
      const accountId = await openAndDeposit(1000);

      const res = await http()
        .post(`/accounts/${accountId}/withdrawals`)
        .send({ amountMinor: 5000, operationId: 'dep-1' })
        .expect(409);
      expect(res.body.code).toBe('OPERATION_ID_REUSED');
    });

    it('rejects a withdrawal reusing a withdrawal key with a deposit (409)', async () => {
      const accountId = await openAndDeposit(1000);
      await http()
        .post(`/accounts/${accountId}/withdrawals`)
        .send({ amountMinor: 300, operationId: 'wd-1' })
        .expect(200);

      const res = await http()
        .post(`/accounts/${accountId}/deposits`)
        .send({ amountMinor: 300, operationId: 'wd-1' })
        .expect(409);
      expect(res.body.code).toBe('OPERATION_ID_REUSED');
    });

    it.each([
      [{ amountMinor: 0, operationId: 'op' }],
      [{ amountMinor: -5, operationId: 'op' }],
      [{ amountMinor: 10.5, operationId: 'op' }],
      [{ amountMinor: '100', operationId: 'op' }],
      [{ amountMinor: 100 }],
      [{ amountMinor: 100, operationId: 'op', extra: true }],
    ])('rejects invalid withdrawal body %j (400)', async (body) => {
      const accountId = await openAndDeposit(1000);
      await http().post(`/accounts/${accountId}/withdrawals`).send(body).expect(400);
    });

    it('returns 404 for an unknown account', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000';

      const res = await http()
        .post(`/accounts/${unknown}/withdrawals`)
        .send({ amountMinor: 100, operationId: 'wd-1' })
        .expect(404);
      expect(res.body.code).toBe('ACCOUNT_NOT_FOUND');
    });

    it('returns 400 for a malformed account id', async () => {
      await http()
        .post('/accounts/not-a-uuid/withdrawals')
        .send({ amountMinor: 100, operationId: 'wd-1' })
        .expect(400);
    });
  });

  it('rejects an invalid open-account body (400)', async () => {
    await http().post('/accounts').send({ ownerName: '' }).expect(400);
    await http().post('/accounts').send({ ownerName: 'Ada', currency: 'eur' }).expect(400);
  });
});
