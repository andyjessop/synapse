import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'adapter-gitlab': new URL(
        '../adapter-gitlab/src/index.ts',
        import.meta.url,
      ).pathname,
      'agent-reviewer': new URL(
        '../../agents/agent-reviewer/src/index.ts',
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
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
