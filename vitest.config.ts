import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // performance benchmarks run in plain Node — no browser, no UI
    environment: 'node',
    include: ['bench/**/*.bench.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // print benchmark timings as they run instead of buffering per test
    disableConsoleIntercept: true,
  },
});
