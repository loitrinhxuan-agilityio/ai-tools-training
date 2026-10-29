import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { loadJwtSecret } from '../config/env.js';
import { AuthGuard } from './auth.guard.js';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, JWT_LIFETIME } from './jwt-options.js';

/**
 * Registers the global bearer-token guard. `forRoot` reads the signing key
 * from JWT_SECRET when the app starts. `forSecret` takes it directly and is
 * for tests.
 */
@Module({})
export class AuthModule {
  static forRoot(): DynamicModule {
    return AuthModule.build(() => loadJwtSecret());
  }

  static forSecret(secret: string): DynamicModule {
    return AuthModule.build(() => secret);
  }

  private static build(secret: () => string): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        JwtModule.registerAsync({
          useFactory: () => ({
            secret: secret(),
            signOptions: {
              algorithm: JWT_ALGORITHM,
              issuer: JWT_ISSUER,
              audience: JWT_AUDIENCE,
              expiresIn: JWT_LIFETIME,
            },
            verifyOptions: {
              algorithms: [JWT_ALGORITHM],
              issuer: JWT_ISSUER,
              audience: JWT_AUDIENCE,
            },
          }),
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
    };
  }
}
