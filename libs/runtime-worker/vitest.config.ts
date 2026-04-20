import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    /** One worker avoids ioredis + v8 coverage racing on connection teardown. */
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});
