import { describe, expect, it, vi } from 'vitest';

import { createGitLabMergeRequestFixtureClient } from '../../src/fixture-client.js';
import { mrChangesFixtureClientInput } from '../helpers/mr-changes-from-adapter-fixture.js';

describe('createGitLabMergeRequestFixtureClient tracing', () => {
  it('runs fetchChanges inside runWithRuntimeSpan when tracer is set', async () => {
    const { repoRoot, changesFile } = mrChangesFixtureClientInput(
      import.meta.url,
    );
    const startSpan = vi.fn(() => ({
      end: vi.fn(),
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
    }));
    const client = createGitLabMergeRequestFixtureClient({
      repoRoot,
      changesFile,
      tracer: { startSpan } as never,
      metrics: {
        recordAdapter: vi.fn(),
      } as never,
    });
    await client.fetchChanges({ projectId: 202, mergeRequestIid: 42 });
    expect(startSpan).toHaveBeenCalled();
  });

  it('records failure metric when read fails', async () => {
    const recordAdapter = vi.fn();
    const client = createGitLabMergeRequestFixtureClient({
      repoRoot: '/nonexistent-repo-root',
      changesFile: 'missing.json',
      metrics: { recordAdapter } as never,
    });
    await expect(
      client.fetchChanges({ projectId: 1, mergeRequestIid: 1 }),
    ).rejects.toThrow();
    expect(recordAdapter).toHaveBeenCalledWith({
      adapter: 'gitlab',
      operation: 'fetch_mr_changes',
      result: 'failure',
    });
  });
});
