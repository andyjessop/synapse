import { describe, expect, it, vi } from 'vitest';

import { gitlabFetchChangesMethod } from '../../src/methods/fetch-changes.js';

describe('gitlabFetchChangesMethod', () => {
  it('invokeLive delegates to gitlab client', async () => {
    const changes = {
      project_id: 1,
      merge_request_iid: 2,
      changes: [],
    };
    const gitlabClient = {
      fetchChanges: vi.fn().mockResolvedValue(changes),
    };
    const result = await gitlabFetchChangesMethod.invokeLive(
      { projectId: 1, mergeRequestIid: 2 },
      { gitlabClient },
    );
    expect(result).toEqual(changes);
    expect(gitlabClient.fetchChanges).toHaveBeenCalledWith({
      projectId: 1,
      mergeRequestIid: 2,
    });
  });

  it('parses params with strict schema', () => {
    const parsed = gitlabFetchChangesMethod.paramsSchema.safeParse({
      projectId: 202,
      mergeRequestIid: 42,
    });
    expect(parsed.success).toBe(true);
  });
});
