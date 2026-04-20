import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ADAPTER_FIXTURE_SCHEMA_PATHS,
  adapterFixtureMatchSatisfies,
  assertFixtureSchemaFileExists,
  findAdapterFixtureMatch,
  loadAdapterFixtureFile,
  parseAdapterFixtureJson,
  WEBHOOK_FIXTURE_SCHEMA_PATHS,
} from '../../src/index.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('adapter fixture schemas', () => {
  it('parses shipped gitlab and pi adapter fixtures', () => {
    const gitlab = loadAdapterFixtureFile(
      repoRoot,
      'fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json',
    );
    expect(gitlab.schema).toBe(
      ADAPTER_FIXTURE_SCHEMA_PATHS.GITLAB_FETCH_CHANGES,
    );
    expect(gitlab.adapter).toBe('gitlab');
    expect(gitlab.method).toBe('fetchChanges');
    assertFixtureSchemaFileExists(repoRoot, gitlab.schema);

    const pi = loadAdapterFixtureFile(
      repoRoot,
      'fixtures/agent-reviewer/adapters/pi-review-synapse.json',
    );
    expect(pi.schema).toBe(ADAPTER_FIXTURE_SCHEMA_PATHS.PI_REVIEW);
    expect(pi.response.markdown).toContain('## Summary');
  });

  it('matches fetchChanges by request fields', () => {
    const gitlab = loadAdapterFixtureFile(
      repoRoot,
      'fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json',
    );
    expect(
      adapterFixtureMatchSatisfies(gitlab.match, {
        projectId: 202,
        mergeRequestIid: 42,
      }),
    ).toBe(true);
    expect(
      adapterFixtureMatchSatisfies(gitlab.match, {
        projectId: 999,
        mergeRequestIid: 42,
      }),
    ).toBe(false);
    expect(
      findAdapterFixtureMatch([gitlab], {
        projectId: 202,
        mergeRequestIid: 42,
      }),
    ).toBe(gitlab);
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

  it('requires webhook run-loop schema path on fixture files', () => {
    const raw = JSON.parse(
      readFileSync(
        join(
          repoRoot,
          'fixtures/agent-reviewer/review-pr-gitlab-synapse.fixture.json',
        ),
        'utf8',
      ),
    ) as { schema: string };
    expect(raw.schema).toBe(WEBHOOK_FIXTURE_SCHEMA_PATHS.RUN_LOOP);
    assertFixtureSchemaFileExists(repoRoot, raw.schema);
  });
});
