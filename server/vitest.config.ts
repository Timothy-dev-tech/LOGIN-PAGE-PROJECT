import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The first run downloads a MongoDB binary for mongodb-memory-server, which can take
    // far longer than Vitest's default 10 seconds. Without this, `beforeAll` times out.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/test/**', // test helpers
        'src/types/**',
        // Thin start-up wrappers: they read the environment, open a real connection and
        // listen on a port. Everything they call is tested; the wiring is checked by running it.
        'src/server.ts',
        'src/db.ts',
        'src/scripts/**',
      ],
      // CI (Step 11) fails if coverage drops below these. Set just under today's numbers.
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});