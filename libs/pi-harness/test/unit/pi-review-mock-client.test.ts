import { join } from 'node:path';

import type { PiReviewRequest } from 'agent-reviewer';
import { getRepoRoot } from 'runtime-config';
import { loadAdapterFixtureFile } from 'runtime-manifest';
import { describe, expect, it } from 'vitest';

import { createPiReviewMockClient } from '../../src/pi-review-mock-client.js';

const PI_FIXTURE = 'fixtures/agent-reviewer/adapters/pi-review-synapse.json';

describe('createPiReviewMockClient', () => {
  it('returns markdown from a matching pi.review rule', async () => {
    const repoRoot = getRepoRoot(import.meta.url);
    const rule = loadAdapterFixtureFile(repoRoot, PI_FIXTURE);
    const client = createPiReviewMockClient({ repoRoot, rules: [rule] });
    const request: PiReviewRequest = {
      repoRoot,
      prompt: 'review',
      promptVersion: 'review-pr.v2',
      subject: 'mr/202/42',
      inputEventId: 'evt_test',
      gitlab: { projectId: 202, mergeRequestIid: 42 },
    };
    const result = await client.review(request);
    expect(result.markdown).toContain('## Summary');
    expect(result.command).toBe('fixture');
  });

  it('throws when no rule matches', async () => {
    const repoRoot = getRepoRoot(import.meta.url);
    const rule = loadAdapterFixtureFile(repoRoot, PI_FIXTURE);
    const client = createPiReviewMockClient({ repoRoot, rules: [rule] });
    await expect(
      client.review({
        repoRoot,
        prompt: 'review',
        promptVersion: 'review-pr.v2',
        subject: 'mr/1/1',
        inputEventId: 'evt_test',
        gitlab: { projectId: 1, mergeRequestIid: 1 },
      }),
    ).rejects.toThrow(/No adapter fixture match/);
    expect(join(repoRoot, PI_FIXTURE)).toContain('pi-review-synapse');
  });
});
