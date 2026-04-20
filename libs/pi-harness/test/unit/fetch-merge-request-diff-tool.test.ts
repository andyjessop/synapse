import { describe, expect, it, vi } from 'vitest';

import { createFetchMergeRequestDiffToolDefinition } from '../../src/tools/fetch-merge-request-diff-tool.js';

describe('createFetchMergeRequestDiffToolDefinition', () => {
  it('has the exact tool name fetch_merge_request_diff', () => {
    const tool = createFetchMergeRequestDiffToolDefinition({
      client: { fetchChanges: vi.fn() },
      expectedRequest: { projectId: 202, mergeRequestIid: 42 },
    });
    expect(tool.name).toBe('fetch_merge_request_diff');
  });

  it('rejects args that disagree with expected MR context', async () => {
    const tool = createFetchMergeRequestDiffToolDefinition({
      client: { fetchChanges: vi.fn() },
      expectedRequest: { projectId: 202, mergeRequestIid: 42 },
    });
    await expect(
      tool.execute('call-1', { project_id: 999, merge_request_iid: 42 }),
    ).rejects.toThrow(/must match review context/);
  });

  it('returns markdown from the gitlab client', async () => {
    const fetchChanges = vi.fn().mockResolvedValue({
      project_id: 202,
      merge_request_iid: 42,
      changes: [
        {
          old_path: 'x.ts',
          new_path: 'x.ts',
          diff: '+line\n',
        },
      ],
    });
    const tool = createFetchMergeRequestDiffToolDefinition({
      client: { fetchChanges },
      expectedRequest: { projectId: 202, mergeRequestIid: 42 },
    });
    const result = await tool.execute('call-1', {
      project_id: 202,
      merge_request_iid: 42,
    });
    expect(fetchChanges).toHaveBeenCalledWith({
      projectId: 202,
      mergeRequestIid: 42,
      mergeRequestId: undefined,
    });
    expect(result.content[0]?.text).toContain('## x.ts');
  });
});
