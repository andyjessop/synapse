import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'runtime-config': new URL(
        '../runtime-config/src/index.ts',
        import.meta.url,
      ).pathname,
      'runtime-observability': new URL(
        '../runtime-observability/src/index.ts',
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
