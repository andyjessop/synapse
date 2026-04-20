import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'runtime-agent': fileURLToPath(
        new URL('../../../libs/runtime-agent/src/index.ts', import.meta.url),
      ),
      'runtime-worker': fileURLToPath(
        new URL('../../../libs/runtime-worker/src/index.ts', import.meta.url),
      ),
      'runtime-store': fileURLToPath(
        new URL('../../../libs/runtime-store/src/index.ts', import.meta.url),
      ),
      'runtime-config': fileURLToPath(
        new URL('../../../libs/runtime-config/src/index.ts', import.meta.url),
      ),
      'agent-test-harness': fileURLToPath(
        new URL(
          '../../../libs/agent-test-harness/src/index.ts',
          import.meta.url,
        ),
      ),
      'dev-once': fileURLToPath(
        new URL('../../../libs/dev-once/src/index.ts', import.meta.url),
      ),
      'runtime-manifest': fileURLToPath(
        new URL('../../../libs/runtime-manifest/src/index.ts', import.meta.url),
      ),
      'synapse-fixtures': fileURLToPath(
        new URL('../../../libs/synapse-fixtures/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
