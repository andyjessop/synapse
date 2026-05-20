import { join } from 'node:path';

import { getRepoRoot } from 'runtime-config';
import { describe, expect, it } from 'vitest';

import { loadGitlabAdapterFixtureFile } from '../../src/fixtures.js';
import { createGitLabMergeRequestMockClient } from '../../src/testing.js';

const GITLAB_FIXTURE =
  'fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json';

describe('createGitLabMergeRequestMockClient', () => {
  it('returns the matched fixture response', async () => {
    const repoRoot = getRepoRoot(import.meta.url);
    const rule = loadGitlabAdapterFixtureFile(repoRoot, GITLAB_FIXTURE);
    const client = createGitLabMergeRequestMockClient({ rules: [rule] });
    const result = await client.fetchChanges({
      projectId: 202,
      mergeRequestIid: 42,
    });
    expect(result.project_id).toBe(202);
    expect(result.changes.length).toBeGreaterThanOrEqual(2);
  });

  it('throws when no rule matches', async () => {
    const repoRoot = getRepoRoot(import.meta.url);
    const rule = loadGitlabAdapterFixtureFile(repoRoot, GITLAB_FIXTURE);
    const client = createGitLabMergeRequestMockClient({ rules: [rule] });
    await expect(
      client.fetchChanges({ projectId: 1, mergeRequestIid: 1 }),
    ).rejects.toThrow(/No adapter fixture match/);
    expect(join(repoRoot, GITLAB_FIXTURE)).toContain('gitlab-fetch-changes');
  });
});
