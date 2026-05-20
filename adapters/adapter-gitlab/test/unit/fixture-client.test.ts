import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createGitLabMergeRequestFixtureClient } from '../../src/fixture-client.js';
import { mrChangesFixtureClientInput } from '../helpers/mr-changes-from-adapter-fixture.js';

describe('createGitLabMergeRequestFixtureClient', () => {
  it('reads and parses the synapse MR changes fixture', async () => {
    const { repoRoot, changesFile } = mrChangesFixtureClientInput(
      import.meta.url,
    );
    const client = createGitLabMergeRequestFixtureClient({
      repoRoot,
      changesFile,
    });
    const result = await client.fetchChanges({
      projectId: 202,
      mergeRequestIid: 42,
    });
    expect(result.project_id).toBe(202);
    expect(result.merge_request_iid).toBe(42);
    expect(result.changes.length).toBeGreaterThanOrEqual(2);
    expect(result.changes[0]?.diff).toContain('@@');
  });

  it('resolves fixture path from repo root', async () => {
    const { repoRoot, changesFile } = mrChangesFixtureClientInput(
      import.meta.url,
    );
    const client = createGitLabMergeRequestFixtureClient({
      repoRoot,
      changesFile,
    });
    const result = await client.fetchChanges({
      projectId: 999,
      mergeRequestIid: 1,
    });
    expect(join(repoRoot, changesFile)).toContain('mr-changes.json');
    expect(result.changes.length).toBeGreaterThan(0);
  });
});
