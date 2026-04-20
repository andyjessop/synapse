import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'runtime-agent': fileURLToPath(
        new URL('../runtime-agent/src/index.ts', import.meta.url),
      ),
      'runtime-events': fileURLToPath(
        new URL('../runtime-events/src/index.ts', import.meta.url),
      ),
      'dev-cli-shared': fileURLToPath(
        new URL('../dev-cli-shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
