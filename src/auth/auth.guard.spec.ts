import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ForbiddenError, UnauthenticatedError } from '../shared/domain-errors.js';
import { AuthGuard } from './auth.guard.js';
import { JWT_AUDIENCE, JWT_ISSUER } from './jwt-options.js';
import { RequireRole } from './require-role.decorator.js';
import { INTERNAL_SUPPORT_ROLE } from './roles.js';
import {
  TEST_JWT_SECRET,
  signTestClaims,
  signTestToken,
  unsignedTestToken,
} from '../../test/support/test-tokens.js';

class AccountsRoutes {
  open(): void {}

  @RequireRole(INTERNAL_SUPPORT_ROLE)
  events(): void {}

  /* Test-only role. It is not a production role, and no token can carry it. */
  @RequireRole('TEST_ONLY_ROLE')
  restricted(): void {}
}

function contextFor(
  route: keyof AccountsRoutes,
  authorization?: string,
): ExecutionContext {
  const request = { headers: authorization === undefined ? {} : { authorization } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => AccountsRoutes.prototype[route],
    getClass: () => AccountsRoutes,
  } as unknown as ExecutionContext;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('AuthGuard', () => {
  const guard = new AuthGuard(new JwtService({ secret: TEST_JWT_SECRET }), new Reflector());

  describe('authentication', () => {
    it('refuses a request with no Authorization header, as not-presented', async () => {
      const refused = guard.canActivate(contextFor('open'));
      await expect(refused).rejects.toBeInstanceOf(UnauthenticatedError);
      await expect(refused).rejects.toMatchObject({ invalidToken: false });
    });

    it('refuses a scheme other than Bearer, as not-presented', async () => {
      await expect(
        guard.canActivate(contextFor('open', `Basic ${signTestToken()}`)),
      ).rejects.toMatchObject({ invalidToken: false });
    });

    it('refuses a token signed with another key, as invalid', async () => {
      const token = signTestToken({ secret: 'some-other-key-0123456789abcdef0123' });
      await expect(
        guard.canActivate(contextFor('open', `Bearer ${token}`)),
      ).rejects.toMatchObject({ invalidToken: true });
    });

    it('refuses an expired token', async () => {
      const token = signTestToken({
        role: INTERNAL_SUPPORT_ROLE,
        expiresAt: nowSeconds() - 60,
      });
      await expect(
        guard.canActivate(contextFor('open', `Bearer ${token}`)),
      ).rejects.toMatchObject({ invalidToken: true });
    });

    it('refuses a token for another issuer or audience', async () => {
      const wrongIssuer = signTestToken({ issuer: 'someone-else' });
      const wrongAudience = signTestToken({ audience: 'someone-else' });
      await expect(
        guard.canActivate(contextFor('open', `Bearer ${wrongIssuer}`)),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
      await expect(
        guard.canActivate(contextFor('open', `Bearer ${wrongAudience}`)),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
    });

    it('refuses an HS512 token, even when it is otherwise valid', async () => {
      const token = signTestClaims(
        {
          sub: 'test-caller',
          role: INTERNAL_SUPPORT_ROLE,
          iss: JWT_ISSUER,
          aud: JWT_AUDIENCE,
          iat: nowSeconds(),
          exp: nowSeconds() + 900,
        },
        { algorithm: 'HS512' },
      );
      await expect(
        guard.canActivate(contextFor('open', `Bearer ${token}`)),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
    });

    it('refuses an alg none token with an empty signature', async () => {
      const token = unsignedTestToken({
        sub: 'test-caller',
        role: INTERNAL_SUPPORT_ROLE,
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
        iat: nowSeconds(),
        exp: nowSeconds() + 900,
      });
      await expect(
        guard.canActivate(contextFor('open', `Bearer ${token}`)),
      ).rejects.toMatchObject({ invalidToken: true });
    });

    it('refuses a token older than 15 minutes even when its exp is far in the future', async () => {
      const token = signTestClaims({
        sub: 'test-caller',
        role: INTERNAL_SUPPORT_ROLE,
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
        iat: nowSeconds() - 16 * 60,
        exp: nowSeconds() + 365 * 24 * 60 * 60,
      });
      await expect(
        guard.canActivate(contextFor('open', `Bearer ${token}`)),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
    });

    it('refuses a token issued well in the future', async () => {
      const token = signTestClaims({
        sub: 'test-caller',
        role: INTERNAL_SUPPORT_ROLE,
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
        iat: nowSeconds() + 30 * 24 * 60 * 60,
        exp: nowSeconds() + 30 * 24 * 60 * 60 + 900,
      });
      await expect(
        guard.canActivate(contextFor('open', `Bearer ${token}`)),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
    });

    it('accepts a token whose issue time is within the clock tolerance', async () => {
      const token = signTestClaims({
        sub: 'test-caller',
        role: INTERNAL_SUPPORT_ROLE,
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
        iat: nowSeconds() + 30,
        exp: nowSeconds() + 900,
      });
      await expect(
        guard.canActivate(contextFor('open', `Bearer ${token}`)),
      ).resolves.toBe(true);
    });

    it('refuses a token with no iat claim', async () => {
      const token = signTestClaims({
        sub: 'test-caller',
        role: INTERNAL_SUPPORT_ROLE,
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
        exp: nowSeconds() + 900,
      });
      await expect(
        guard.canActivate(contextFor('open', `Bearer ${token}`)),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
    });

    it.each([
      ['no sub claim', { role: INTERNAL_SUPPORT_ROLE }],
      ['an empty sub claim', { sub: '', role: INTERNAL_SUPPORT_ROLE }],
      ['no role claim', { sub: 'test-caller' }],
      ['an empty role claim', { sub: 'test-caller', role: '' }],
    ])('refuses a token with %s', async (_, claims) => {
      const token = signTestClaims({
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
        iat: nowSeconds(),
        exp: nowSeconds() + 900,
        ...claims,
      });
      await expect(
        guard.canActivate(contextFor('open', `Bearer ${token}`)),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
    });

    it('refuses a token with no exp claim', async () => {
      const token = signTestClaims({
        sub: 'test-caller',
        role: INTERNAL_SUPPORT_ROLE,
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
        iat: nowSeconds(),
      });
      await expect(
        guard.canActivate(contextFor('open', `Bearer ${token}`)),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
    });

    it('rethrows an error that is not a token refusal, so a server fault is not a 401', async () => {
      const failing = new AuthGuard(
        { verifyAsync: async () => Promise.reject(new Error('secret misconfigured')) } as unknown as JwtService,
        new Reflector(),
      );
      await expect(
        failing.canActivate(contextFor('open', `Bearer ${signTestToken()}`)),
      ).rejects.toThrow('secret misconfigured');
      await expect(
        failing.canActivate(contextFor('open', `Bearer ${signTestToken()}`)),
      ).rejects.not.toBeInstanceOf(UnauthenticatedError);
    });

    it('allows any recognized caller on a route with no role requirement', async () => {
      const token = signTestToken({ role: INTERNAL_SUPPORT_ROLE });
      await expect(guard.canActivate(contextFor('open', `Bearer ${token}`))).resolves.toBe(
        true,
      );
    });
  });

  describe('authorization', () => {
    it('refuses a token whose role is not on the allow-list, as invalid', async () => {
      const token = signTestToken({ role: 'customer' });
      await expect(
        guard.canActivate(contextFor('events', `Bearer ${token}`)),
      ).rejects.toMatchObject({ invalidToken: true });
    });

    it('refuses a recognized caller that lacks the route role, with ForbiddenError', async () => {
      const token = signTestToken({ role: INTERNAL_SUPPORT_ROLE });
      await expect(
        guard.canActivate(contextFor('restricted', `Bearer ${token}`)),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('treats a token with no role claim as unauthenticated on a role-restricted route', async () => {
      const token = signTestToken();
      await expect(
        guard.canActivate(contextFor('events', `Bearer ${token}`)),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
    });

    it('allows a caller with the required role', async () => {
      const token = signTestToken({ role: INTERNAL_SUPPORT_ROLE });
      await expect(
        guard.canActivate(contextFor('events', `Bearer ${token}`)),
      ).resolves.toBe(true);
    });

    it('refuses a missing token on a role-restricted route as not-presented', async () => {
      await expect(guard.canActivate(contextFor('events'))).rejects.toMatchObject({
        invalidToken: false,
      });
    });
  });
});
