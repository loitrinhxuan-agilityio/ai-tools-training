import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventSourcingModule, EventStore } from '@ocoda/event-sourcing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../app.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { JWT_AUDIENCE, JWT_ISSUER, JWT_REALM } from '../auth/jwt-options.js';
import { INTERNAL_SUPPORT_ROLE } from '../auth/roles.js';
import {
  TEST_JWT_SECRET,
  signTestClaims,
  signTestToken,
  unsignedTestToken,
} from '../../test/support/test-tokens.js';

const PLAIN_CHALLENGE = `Bearer realm="${JWT_REALM}"`;
const INVALID_TOKEN_CHALLENGE = `${PLAIN_CHALLENGE}, error="invalid_token"`;

/*
 * SEC-01 access control over HTTP, using the in-memory event store. Covers
 * the refusals for every route (TC-SEC-001, TC-SEC-002), the WWW-Authenticate
 * challenge (RFC 6750), and the role limit on raw event history (TC-SEC-003).
 */
describe('Accounts HTTP access control', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.register(
          EventSourcingModule.forRoot({}),
          AuthModule.forSecret(TEST_JWT_SECRET),
        ),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const anon = () => request(app.getHttpServer());
  const withToken = (token: string) => ({
    get: (url: string) => anon().get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => anon().post(url).set('Authorization', `Bearer ${token}`),
  });
  const internal = withToken(signTestToken({ role: INTERNAL_SUPPORT_ROLE }));
  const customer = withToken(signTestToken({ role: 'customer' }));

  async function openAccount(): Promise<string> {
    const res = await internal.post('/accounts').send({ ownerName: 'Ada' }).expect(201);
    return res.body.accountId;
  }

  /** Counts every event in the store. Test-only read; no production endpoint. */
  async function countEvents(): Promise<number> {
    let count = 0;
    for await (const batch of app.get(EventStore).readAll()) count += batch.length;
    return count;
  }

  describe('refuses every route without a token (TC-SEC-001, TC-SEC-002)', () => {
    let accountId: string;

    beforeEach(async () => {
      accountId = await openAccount();
      await internal
        .post(`/accounts/${accountId}/deposits`)
        .send({ amountMinor: 100, operationId: 'op-1' })
        .expect(200);
    });

    const routes = [
      {
        name: 'POST /accounts',
        send: () => anon().post('/accounts').send({ ownerName: 'Ada' }),
      },
      {
        name: 'POST /accounts/:id/deposits',
        send: () =>
          anon()
            .post(`/accounts/${accountId}/deposits`)
            .send({ amountMinor: 500, operationId: 'op-2' }),
      },
      {
        name: 'POST /accounts/:id/withdrawals',
        send: () =>
          anon()
            .post(`/accounts/${accountId}/withdrawals`)
            .send({ amountMinor: 50, operationId: 'op-3' }),
      },
      {
        name: 'GET /accounts/:id',
        send: () => anon().get(`/accounts/${accountId}`),
      },
      {
        name: 'GET /accounts/:id/deposits/:operationId',
        send: () => anon().get(`/accounts/${accountId}/deposits/op-1`),
      },
      {
        name: 'GET /accounts/:id/events',
        send: () => anon().get(`/accounts/${accountId}/events`),
      },
    ];

    it.each(routes)('$name is refused with 401 UNAUTHENTICATED', async ({ send }) => {
      const res = await send().expect(401);
      expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED' });
    });

    it('sends the plain Bearer challenge when no credentials are presented', async () => {
      const res = await anon().get(`/accounts/${accountId}`).expect(401);
      expect(res.headers['www-authenticate']).toBe(PLAIN_CHALLENGE);
    });

    it('does not reveal validation detail in the 401 body', async () => {
      const res = await withToken(
        signTestToken({ role: INTERNAL_SUPPORT_ROLE, expiresAt: 1 }),
      )
        .get(`/accounts/${accountId}`)
        .expect(401);
      expect(res.body).toEqual({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
    });

    it('an unauthenticated write leaves the account unchanged', async () => {
      await anon()
        .post(`/accounts/${accountId}/deposits`)
        .send({ amountMinor: 500, operationId: 'op-2' })
        .expect(401);

      const state = await internal.get(`/accounts/${accountId}`).expect(200);
      expect(state.body).toMatchObject({ balanceMinor: 100, version: 2 });
    });

    it('an unauthenticated withdrawal leaves the balance unchanged', async () => {
      await anon()
        .post(`/accounts/${accountId}/withdrawals`)
        .send({ amountMinor: 50, operationId: 'op-3' })
        .expect(401);

      const state = await internal.get(`/accounts/${accountId}`).expect(200);
      expect(state.body).toMatchObject({ balanceMinor: 100, version: 2 });
    });

    it('an unauthenticated account opening persists no account', async () => {
      const eventsBefore = await countEvents();
      const res = await anon()
        .post('/accounts')
        .send({ ownerName: 'Grace' })
        .expect(401);
      expect(res.body.accountId).toBeUndefined();
      expect(await countEvents()).toBe(eventsBefore);
    });

    it('refuses a request with a non-bearer Authorization scheme', async () => {
      const res = await anon()
        .get(`/accounts/${accountId}`)
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .expect(401);
      expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(res.headers['www-authenticate']).toBe(PLAIN_CHALLENGE);
    });

    it.each([
      [
        'a token signed with another key',
        signTestToken({
          role: INTERNAL_SUPPORT_ROLE,
          secret: 'another-key-0123456789abcdef0123456789',
        }),
      ],
      [
        'an expired token',
        signTestToken({
          role: INTERNAL_SUPPORT_ROLE,
          expiresAt: Math.floor(Date.now() / 1000) - 60,
        }),
      ],
      [
        'a token for another audience',
        signTestToken({ role: INTERNAL_SUPPORT_ROLE, audience: 'someone-else' }),
      ],
      [
        'a token from another issuer',
        signTestToken({ role: INTERNAL_SUPPORT_ROLE, issuer: 'someone-else' }),
      ],
      [
        'an HS512 token',
        signTestClaims(
          {
            sub: 'test-caller',
            role: INTERNAL_SUPPORT_ROLE,
            iss: JWT_ISSUER,
            aud: JWT_AUDIENCE,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 900,
          },
          { algorithm: 'HS512' },
        ),
      ],
      [
        'a token with no role claim',
        signTestClaims({
          sub: 'test-caller',
          iss: JWT_ISSUER,
          aud: JWT_AUDIENCE,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 900,
        }),
      ],
      [
        'a token with no exp claim',
        signTestClaims({
          sub: 'test-caller',
          role: INTERNAL_SUPPORT_ROLE,
          iss: JWT_ISSUER,
          aud: JWT_AUDIENCE,
          iat: Math.floor(Date.now() / 1000),
        }),
      ],
      [
        'a token with no sub claim',
        signTestClaims({
          role: INTERNAL_SUPPORT_ROLE,
          iss: JWT_ISSUER,
          aud: JWT_AUDIENCE,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 900,
        }),
      ],
      [
        'an alg none token',
        unsignedTestToken({
          sub: 'test-caller',
          role: INTERNAL_SUPPORT_ROLE,
          iss: JWT_ISSUER,
          aud: JWT_AUDIENCE,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 900,
        }),
      ],
    ])('refuses %s with the invalid_token challenge', async (_, token) => {
      const res = await withToken(token).get(`/accounts/${accountId}`).expect(401);
      expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(res.headers['www-authenticate']).toBe(INVALID_TOKEN_CHALLENGE);
    });
  });

  describe('limits raw event history to the internal role (TC-SEC-003)', () => {
    let accountId: string;

    beforeEach(async () => {
      accountId = await openAccount();
    });

    it('refuses a token whose role is not on the allow-list, as 401 invalid_token', async () => {
      const res = await customer.get(`/accounts/${accountId}/events`).expect(401);
      expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(res.headers['www-authenticate']).toBe(INVALID_TOKEN_CHALLENGE);
    });

    it('treats a caller with no role claim as unauthenticated, not forbidden', async () => {
      const token = signTestClaims({
        sub: 'no-role',
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
      });
      const res = await withToken(token).get(`/accounts/${accountId}/events`).expect(401);
      expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('returns the event history to the internal role', async () => {
      const res = await internal.get(`/accounts/${accountId}/events`).expect(200);
      expect(res.body).toHaveLength(1);
    });

    it('keeps the other routes open to any recognized caller', async () => {
      await internal.get(`/accounts/${accountId}`).expect(200);
      await internal
        .post(`/accounts/${accountId}/deposits`)
        .send({ amountMinor: 100, operationId: 'op-1' })
        .expect(200);
    });
  });
});
