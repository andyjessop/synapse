import { defineConfig } from 'vitest/config';

/**
 * Package-local coverage: `schema.ts` and `migrations.ts` are excluded because v8
 * instruments FK `references(() => …)` poorly and migration bootstrap/path logic is
 * narrow integration concerns; behavior is enforced by migration + catalog tests.
 *
 * `queries/**` is excluded: query modules are exercised end-to-end via integration
 * tests and apps; keeping 100% on every SQL branch here is brittle for this repo.
 */
export default defineConfig({
  test: {
    include: [
      'test/unit/streams-validation.test.ts',
      'test/unit/event-payload-legacy.test.ts',
      'test/unit/migrations.test.ts',
      'test/integration/streams-store.integration.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/db.ts', 'src/index.ts', 'src/types.ts'],
      exclude: ['src/schema.ts', 'src/migrations.ts'],
      thresholds: {
        statements: 35,
        branches: 35,
        functions: 35,
        lines: 35,
      },
    },
  },
});
