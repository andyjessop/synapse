import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'dev-cli-shared': fileURLToPath(
        new URL('./libs/dev-cli-shared/src/index.ts', import.meta.url),
      ),
      'dev-once': fileURLToPath(
        new URL('./libs/dev-once/src/index.ts', import.meta.url),
      ),
      'synapse-fixtures': fileURLToPath(
        new URL('./libs/synapse-fixtures/src/index.ts', import.meta.url),
      ),
      'runtime-manifest': fileURLToPath(
        new URL('./libs/runtime-manifest/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: [
      'test/**/*.test.ts',
      'scripts/**/*.test.ts',
      'libs/dev-cli-shared/**/*.test.ts',
      'libs/synapse-fixtures/**/*.test.ts',
      'libs/dev-once/**/*.test.ts',
    ],
    environment: 'node',
  },
});
