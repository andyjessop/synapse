import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'agent-reviewer': new URL(
        '../../agents/agent-reviewer/src/index.ts',
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: [
        'src/app.ts',
        'src/webhook-route-registry.ts',
        'src/routes/**/*.ts',
      ],
      exclude: ['src/main.ts', 'src/env.ts'],
      thresholds: {
        statements: 65,
        branches: 25,
        functions: 60,
        lines: 65,
      },
    },
  },
});
