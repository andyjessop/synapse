import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'runtime-adapters': new URL(
        '../../libs/runtime-adapters/src/index.ts',
        import.meta.url,
      ).pathname,
      'runtime-config': new URL(
        '../../libs/runtime-config/src/index.ts',
        import.meta.url,
      ).pathname,
      'runtime-observability': new URL(
        '../../libs/runtime-observability/src/index.ts',
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
