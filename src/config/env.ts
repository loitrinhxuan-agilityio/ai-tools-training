export interface AppConfig {
  databaseUrl: string;
  port: number;
}

/**
 * Reads and validates configuration from the environment. A local `.env`
 * file (git-ignored, see `.env.example`) is loaded if present; variables
 * already set in the shell take precedence.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
  }

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got "${env.PORT}"`);
  }

  return { databaseUrl, port };
}

/**
 * Reads the key that signs and verifies bearer tokens. It is read when the
 * app starts, not when this module loads. HS256 needs a key of at least 32
 * characters.
 */
export function loadJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Set it in .env (see .env.example).');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters.');
  }
  if (KNOWN_TEST_SECRETS.includes(secret)) {
    throw new Error('JWT_SECRET is a known test key and cannot be used.');
  }
  if (new Set(secret).size < 16) {
    throw new Error('JWT_SECRET must use at least 16 different characters.');
  }
  return secret;
}

/** Default for AUDIT_WRITE_TIMEOUT_MS (approved W3: 2 seconds). */
const DEFAULT_AUDIT_WRITE_TIMEOUT_MS = 2000;

/*
 * Upper bound. Node timers fire at once above 2^31-1 ms, so a larger value
 * would make every audit write fail. One minute is far above a normal insert.
 */
const MAX_AUDIT_WRITE_TIMEOUT_MS = 60_000;

/**
 * How long one audit write may take, from waiting for a connection to the end of
 * the INSERT, before the read it guards fails closed (WH-04, W3). Milliseconds:
 * plain decimal digits from 1 to 60000. Defaults to 2000. It does not bound the
 * start-up table check, which has its own budget.
 */
export function loadAuditWriteTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.AUDIT_WRITE_TIMEOUT_MS;
  if (raw === undefined) return DEFAULT_AUDIT_WRITE_TIMEOUT_MS;
  const timeout = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (
    !Number.isSafeInteger(timeout) ||
    timeout < 1 ||
    timeout > MAX_AUDIT_WRITE_TIMEOUT_MS
  ) {
    // The rejected value is not echoed: environment values stay out of logs.
    throw new Error(
      `AUDIT_WRITE_TIMEOUT_MS must be an integer from 1 to ${MAX_AUDIT_WRITE_TIMEOUT_MS}`,
    );
  }
  return timeout;
}

/**
 * Test-only keys, which are public in the repository. The value must match
 * TEST_JWT_SECRET in test/support/test-tokens.ts.
 */
const KNOWN_TEST_SECRETS = ['test-only-key-not-for-deployment-0123456789abcdef'];

export function loadDotEnvIfPresent(path = '.env'): void {
  try {
    process.loadEnvFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
