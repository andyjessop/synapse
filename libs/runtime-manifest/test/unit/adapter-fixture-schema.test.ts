import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ADAPTER_FIXTURE_SCHEMA_PATHS,
  assertFixtureSchemaFileExists,
  loadAdapterFixtureFile,
  parseAdapterFixtureJson,
  WEBHOOK_FIXTURE_SCHEMA_PATHS,
} from '../../src/index.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('adapter fixture schemas (runtime-manifest)', () => {
  it('parses shipped pi adapter fixture', () => {
    const pi = loadAdapterFixtureFile(
      repoRoot,
      'fixtures/agent-reviewer/adapters/pi-review-synapse.json',
    );
    expect(pi.schema).toBe(ADAPTER_FIXTURE_SCHEMA_PATHS.PI_REVIEW);
    expect(pi.response.markdown).toContain('## Summary');
    assertFixtureSchemaFileExists(repoRoot, pi.schema);
  });

  it('rejects legacy schema id strings', () => {
    expect(() =>
      parseAdapterFixtureJson({
        version: 1,
        schema: 'synapse.adapter.pi.review.v1',
        adapter: 'pi',
        method: 'review',
        match: {},
        response: { markdown: 'x' },
      }),
    ).toThrow(/Unknown fixture schema path/);
  });

  it('rejects unknown adapter fixture schema path', () => {
    expect(() =>
      parseAdapterFixtureJson({
        version: 1,
        schema: 'libs/runtime-manifest/schemas/adapter/unknown.schema.json',
        adapter: 'x',
        method: 'y',
        match: {},
        response: {},
      }),
    ).toThrow(/Unknown fixture schema path/);
  });

  it('does not register gitlab fixture schema paths', () => {
    expect(WEBHOOK_FIXTURE_SCHEMA_PATHS.RUN_LOOP).toContain(
      'libs/runtime-manifest/schemas/',
    );
    expect('GITLAB_FETCH_CHANGES' in ADAPTER_FIXTURE_SCHEMA_PATHS).toBe(false);
  });
});
