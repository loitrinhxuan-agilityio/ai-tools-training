import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { EventSourcingModule } from '@ocoda/event-sourcing';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { InMemoryAuditWriter } from '../audit/in-memory-audit-writer.js';
import { signTestToken, TEST_JWT_SECRET } from '../../test/support/test-tokens.js';
import { INTERNAL_SUPPORT_ROLE } from './roles.js';

/*
 * The production wiring. AppModule.register() with no auth argument uses
 * AuthModule.forRoot(), which reads JWT_SECRET when the app starts. Every
 * other suite injects a key directly, so this is the only test of that path.
 */
describe('AuthModule production wiring (JWT_SECRET)', () => {
  const saved = process.env.JWT_SECRET;

  afterEach(() => {
    if (saved === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = saved;
  });

  async function start() {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.register(
          EventSourcingModule.forRoot({}),
          undefined,
          AuditModule.forWriter(new InMemoryAuditWriter()),
        ),
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  it('refuses to start when JWT_SECRET is not set', async () => {
    delete process.env.JWT_SECRET;
    await expect(start()).rejects.toThrow(/JWT_SECRET is not set/);
  });

  it('refuses to start with the known test key', async () => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    await expect(start()).rejects.toThrow(/known test key/);
  });

  it('verifies tokens with the configured secret and refuses tokens signed with another key', async () => {
    const configured = randomBytes(32).toString('base64');
    process.env.JWT_SECRET = configured;
    const app = await start();
    try {
      const unknownAccount = `/accounts/${randomUUID()}`;

      // An unknown account returns 404, which shows authentication passed.
      const accepted = signTestToken({ role: INTERNAL_SUPPORT_ROLE, secret: configured });
      await request(app.getHttpServer())
        .get(unknownAccount)
        .set('Authorization', `Bearer ${accepted}`)
        .expect(404);

      // A token signed with the test key is refused by the configured app.
      const refused = signTestToken({ role: INTERNAL_SUPPORT_ROLE });
      await request(app.getHttpServer())
        .get(unknownAccount)
        .set('Authorization', `Bearer ${refused}`)
        .expect(401);
    } finally {
      await app.close();
    }
  });
});
