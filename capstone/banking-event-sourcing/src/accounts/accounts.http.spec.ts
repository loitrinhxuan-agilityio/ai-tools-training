import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventSourcingModule } from '@ocoda/event-sourcing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../app.module.js';

/*
 * Full command/query flow through HTTP, using Ocoda's in-memory event store
 * (the default when no `eventStore` is configured). Fast and DB-free; the
 * Postgres behaviour is covered in test/*.e2e-spec.ts.
 */
describe('Accounts HTTP flow (in-memory event store)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(EventSourcingModule.forRoot({}))],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

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
  });

  it('rejects an invalid open-account body (400)', async () => {
    await http().post('/accounts').send({ ownerName: '' }).expect(400);
    await http().post('/accounts').send({ ownerName: 'Ada', currency: 'eur' }).expect(400);
  });
});
