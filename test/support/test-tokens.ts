import { JwtService } from '@nestjs/jwt';
import {
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
} from '../../src/auth/jwt-options.js';

/*
 * Test-only signing key. Lives in test/ so the build never ships it. Tests
 * pass it to AuthModule.forSecret; the running app reads JWT_SECRET instead,
 * and loadJwtSecret refuses this value.
 */
export const TEST_JWT_SECRET = 'test-only-key-not-for-deployment-0123456789abcdef';

export interface TestTokenOptions {
  role?: string;
  subject?: string;
  secret?: string;
  issuer?: string;
  audience?: string;
  /** Expiry as seconds since the epoch. Defaults to 15 minutes from now. */
  expiresAt?: number;
  /** Issue time as seconds since the epoch. Defaults to now. */
  issuedAt?: number;
}

const jwt = new JwtService();

/** Signs a well-formed token the way a trusted issuer would, for tests only. */
export function signTestToken({
  role,
  subject = 'test-caller',
  secret = TEST_JWT_SECRET,
  issuer = JWT_ISSUER,
  audience = JWT_AUDIENCE,
  expiresAt = Math.floor(Date.now() / 1000) + 15 * 60,
  issuedAt = Math.floor(Date.now() / 1000),
}: TestTokenOptions = {}): string {
  return jwt.sign(
    { sub: subject, role, iss: issuer, aud: audience, iat: issuedAt, exp: expiresAt },
    { secret, algorithm: JWT_ALGORITHM },
  );
}

/**
 * Signs exactly the claims given, for tests of missing or odd claims. When
 * `iat` is absent, `noTimestamp` stops the library adding one. The library
 * also drops an explicit `iat` under that option, so it is only set when
 * `iat` is missing.
 */
export function signTestClaims(
  claims: Record<string, unknown>,
  {
    secret = TEST_JWT_SECRET,
    algorithm = JWT_ALGORITHM,
  }: { secret?: string; algorithm?: 'HS256' | 'HS512' } = {},
): string {
  return jwt.sign(claims, { secret, algorithm, noTimestamp: !('iat' in claims) });
}

/** A token whose header says `alg: none` and whose signature is empty. */
export function unsignedTestToken(claims: Record<string, unknown>): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.`;
}
