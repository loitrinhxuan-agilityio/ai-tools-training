import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ForbiddenError, UnauthenticatedError } from '../shared/domain-errors.js';
import {
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_CLOCK_TOLERANCE_SECONDS,
  JWT_ISSUER,
  JWT_LIFETIME,
} from './jwt-options.js';
import { REQUIRED_ROLE_KEY } from './require-role.decorator.js';
import { RECOGNIZED_ROLES } from './roles.js';

/** Claims this app requires on every bearer token. */
interface CallerClaims {
  sub: string;
  role: string;
  iat: number;
  exp: number;
}

const BEARER = /^Bearer\s+(\S+)$/i;

/** The error names jsonwebtoken uses for a token it refuses. */
const TOKEN_REFUSAL_ERRORS = new Set([
  'JsonWebTokenError',
  'TokenExpiredError',
  'NotBeforeError',
]);

/**
 * Global guard, registered as APP_GUARD, so every route requires a valid
 * bearer token. Routes marked with `@RequireRole` also need that role.
 * Failures are raised as DomainErrors and mapped to HTTP only in
 * DomainExceptionFilter.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const claims = await this.verify(request.headers.authorization);

    const requiredRole = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRED_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRole !== undefined && claims.role !== requiredRole) {
      throw new ForbiddenError();
    }
    return true;
  }

  private async verify(authorization: string | undefined): Promise<CallerClaims> {
    const match = authorization?.match(BEARER);
    if (!match) throw new UnauthenticatedError(false);

    const claims = await this.decode(match[1]);
    if (
      !hasRequiredClaims(claims) ||
      !RECOGNIZED_ROLES.includes(claims.role) ||
      isIssuedInFuture(claims.iat)
    ) {
      throw new UnauthenticatedError(true);
    }
    return claims;
  }

  /**
   * Checks the signature, algorithm, issuer, audience, and age. `maxAge`
   * requires `iat`, so a token without it is refused too. Only errors that
   * mean "this token is not acceptable" become 401s. Anything else is a
   * server fault and is rethrown, so it is not reported as a bad token.
   */
  private async decode(token: string): Promise<Partial<CallerClaims>> {
    try {
      return await this.jwt.verifyAsync<Partial<CallerClaims>>(token, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        maxAge: JWT_LIFETIME,
      });
    } catch (error) {
      if (error instanceof Error && TOKEN_REFUSAL_ERRORS.has(error.name)) {
        throw new UnauthenticatedError(true);
      }
      throw error;
    }
  }
}

function hasRequiredClaims(claims: Partial<CallerClaims>): claims is CallerClaims {
  return (
    typeof claims.iat === 'number' &&
    typeof claims.exp === 'number' &&
    typeof claims.sub === 'string' &&
    claims.sub !== '' &&
    typeof claims.role === 'string' &&
    claims.role !== ''
  );
}

/** A token issued in the future is refused, allowing for clock skew. */
function isIssuedInFuture(iat: number): boolean {
  return iat > Math.floor(Date.now() / 1000) + JWT_CLOCK_TOLERANCE_SECONDS;
}
