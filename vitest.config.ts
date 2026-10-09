import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // unit tests and performance benchmarks both run in plain Node — no
    // browser, no UI. `bench/**` measures timings; `src/**/*.test.ts` asserts.
    environment: 'node',
    include: ['bench/**/*.bench.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // print benchmark timings as they run instead of buffering per test
    disableConsoleIntercept: true,
  },
});
