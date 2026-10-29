import { TEST_JWT_SECRET } from '../../test/support/test-tokens.js';
import { loadJwtSecret } from './env.js';

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
