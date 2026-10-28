import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // Reads .env (git-ignored; see .env.example). Shell variables win.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };

  return {
    resolve: { tsconfigPaths: true },
    test: {
      globals: true,
      root: './',
      include: ['**/*.e2e-spec.ts'],
      // The app under test talks to the test database, never the dev one.
      env: { DATABASE_URL: env.TEST_DATABASE_URL ?? '' },
    },
  };
});
