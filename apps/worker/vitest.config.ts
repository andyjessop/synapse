import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: process.cwd(),
  resolve: {
    alias: {
      'agent-reviewer': new URL(
        '../../agents/agent-reviewer/src/index.ts',
        import.meta.url,
      ).pathname,
      'example-agent-notifier': new URL(
        '../../examples/agents/agent-notifier/src/index.ts',
        import.meta.url,
      ).pathname,
      'pi-harness': new URL(
        '../../libs/pi-harness/src/index.ts',
        import.meta.url,
      ).pathname,
      'runtime-observability': new URL(
        '../../libs/runtime-observability/src/index.ts',
        import.meta.url,
      ).pathname,
      'runtime-manifest': new URL(
        '../../libs/runtime-manifest/src/index.ts',
        import.meta.url,
      ).pathname,
      'dev-cli-shared': new URL(
        '../../libs/dev-cli-shared/src/index.ts',
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
        statements: 55,
        branches: 45,
        functions: 35,
        lines: 55,
      },
    },
  },
});
