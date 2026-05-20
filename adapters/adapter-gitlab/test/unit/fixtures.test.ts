import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  assertGitlabFixtureSchemaFileExists,
  findGitlabAdapterFixtureMatch,
  GITLAB_ADAPTER_FIXTURE_SCHEMA_PATH,
  gitlabAdapterFixtureMatchSatisfies,
  loadGitlabAdapterFixtureFile,
  parseGitlabAdapterFixtureJson,
} from '../../src/fixtures.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('GitLab adapter fixture schemas', () => {
  it('parses shipped gitlab adapter fixture', () => {
    const gitlab = loadGitlabAdapterFixtureFile(
      repoRoot,
      'fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json',
    );
    expect(gitlab.schema).toBe(GITLAB_ADAPTER_FIXTURE_SCHEMA_PATH);
    expect(gitlab.adapter).toBe('gitlab');
    expect(gitlab.method).toBe('fetchChanges');
    assertGitlabFixtureSchemaFileExists(repoRoot, gitlab.schema);
  });

  it('matches fetchChanges by request fields', () => {
    const gitlab = loadGitlabAdapterFixtureFile(
      repoRoot,
      'fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json',
    );
    expect(
      gitlabAdapterFixtureMatchSatisfies(gitlab.match, {
        projectId: 202,
        mergeRequestIid: 42,
      }),
    ).toBe(true);
    expect(
      findGitlabAdapterFixtureMatch([gitlab], {
        projectId: 202,
        mergeRequestIid: 42,
      }),
    ).toBe(gitlab);
  });

  it('rejects unknown adapter fixture schema path', () => {
    expect(() =>
      parseGitlabAdapterFixtureJson({
        version: 1,
        schema: 'adapters/adapter-gitlab/schemas/unknown.schema.json',
        adapter: 'gitlab',
        method: 'fetchChanges',
        match: {},
        response: {},
      }),
    ).toThrow(/Expected GitLab adapter fixture schema/);
  });

  it('loads gitlab adapter fixture schema path from fixtures/', () => {
    const raw = JSON.parse(
      readFileSync(
        join(
          repoRoot,
          'fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json',
        ),
        'utf8',
      ),
    ) as { schema: string };
    expect(raw.schema).toContain('gitlab.fetchChanges');
    assertGitlabFixtureSchemaFileExists(repoRoot, raw.schema);
  });
});
