import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'adapter-gitlab': new URL(
        '../../libs/adapter-gitlab/src/index.ts',
        import.meta.url,
      ).pathname,
      'pi-harness': new URL(
        '../../libs/pi-harness/src/index.ts',
        import.meta.url,
      ).pathname,
      'agent-test-harness': new URL(
        '../../libs/agent-test-harness/src/index.ts',
        import.meta.url,
      ).pathname,
      'dev-once': new URL('../../libs/dev-once/src/index.ts', import.meta.url)
        .pathname,
      'synapse-fixtures': new URL(
        '../../libs/synapse-fixtures/src/index.ts',
        import.meta.url,
      ).pathname,
      'runtime-worker': new URL(
        '../../libs/runtime-worker/src/index.ts',
        import.meta.url,
      ).pathname,
      'runtime-manifest': new URL(
        '../../libs/runtime-manifest/src/index.ts',
        import.meta.url,
      ).pathname,
      'runtime-config': new URL(
        '../../libs/runtime-config/src/index.ts',
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: {
        statements: 85,
        branches: 65,
        functions: 80,
        lines: 85,
      },
    },
  },
});
