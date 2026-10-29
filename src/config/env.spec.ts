import { TEST_JWT_SECRET } from '../../test/support/test-tokens.js';
import { loadAuditWriteTimeoutMs, loadJwtSecret } from './env.js';

describe('loadAuditWriteTimeoutMs', () => {
  it('defaults to 2000 ms when unset', () => {
    expect(loadAuditWriteTimeoutMs({})).toBe(2000);
  });

  it('reads a positive integer', () => {
    expect(loadAuditWriteTimeoutMs({ AUDIT_WRITE_TIMEOUT_MS: '750' })).toBe(750);
  });

  it('accepts the upper bound of 60000', () => {
    expect(loadAuditWriteTimeoutMs({ AUDIT_WRITE_TIMEOUT_MS: '60000' })).toBe(60000);
  });

  it.each(['0', '-5', '1.5', '1e3', '0x7d0', ' 750', 'soon', '', '60001', '3000000000'])(
    'refuses %j',
    (value) => {
      expect(() => loadAuditWriteTimeoutMs({ AUDIT_WRITE_TIMEOUT_MS: value })).toThrow(
        /AUDIT_WRITE_TIMEOUT_MS must be an integer from 1 to 60000/,
      );
    },
  );
});

describe('loadJwtSecret', () => {
  it('returns the secret from JWT_SECRET', () => {
    const varied = 'abcdefghijklmnopqrstuvwxyz012345';
    expect(loadJwtSecret({ JWT_SECRET: varied })).toBe(varied);
  });

  it('refuses a missing secret', () => {
    expect(() => loadJwtSecret({})).toThrow(/JWT_SECRET is not set/);
  });

  it('refuses an empty secret', () => {
    expect(() => loadJwtSecret({ JWT_SECRET: '' })).toThrow(/JWT_SECRET is not set/);
  });

  it('refuses a secret shorter than 32 characters', () => {
    expect(() => loadJwtSecret({ JWT_SECRET: 'a'.repeat(31) })).toThrow(/at least 32/);
  });

  it('refuses the known test key', () => {
    expect(() => loadJwtSecret({ JWT_SECRET: TEST_JWT_SECRET })).toThrow(/known test key/);
  });

  it('refuses a secret with too few distinct characters', () => {
    expect(() => loadJwtSecret({ JWT_SECRET: 'ab'.repeat(16) })).toThrow(/different characters/);
  });
});
