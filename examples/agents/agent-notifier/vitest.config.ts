import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'agent-test-harness': new URL(
        '../../../libs/agent-test-harness/src/index.ts',
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: {
        statements: 85,
        branches: 65,
        functions: 85,
        lines: 85,
      },
    },
  },
});
