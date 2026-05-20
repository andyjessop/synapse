import { describe, expect, it, vi } from 'vitest';

import { GitLabApiError } from '../../src/client.js';
import { createGitLabMergeRequestLiveClient } from '../../src/live-client.js';

describe('createGitLabMergeRequestLiveClient', () => {
  it('maps GitLab API response to mr changes schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        changes: [
          {
            old_path: 'a.ts',
            new_path: 'a.ts',
            diff: 'diff',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createGitLabMergeRequestLiveClient({ token: 'test-token' });
    const result = await client.fetchChanges({
      projectId: 202,
      mergeRequestIid: 42,
    });

    expect(result.project_id).toBe(202);
    expect(result.merge_request_iid).toBe(42);
    expect(result.changes).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('throws GitLabApiError on HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    const client = createGitLabMergeRequestLiveClient({ token: 'test-token' });
    await expect(
      client.fetchChanges({ projectId: 1, mergeRequestIid: 1 }),
    ).rejects.toBeInstanceOf(GitLabApiError);
    vi.unstubAllGlobals();
  });
});
