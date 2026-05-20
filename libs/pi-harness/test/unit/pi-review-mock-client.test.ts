import { describe, expect, it } from 'vitest';

import { createPiReviewMockClient } from '../../src/pi-review-mock-client.js';

describe('createPiReviewMockClient', () => {
  it('returns fixture markdown', async () => {
    const repoRoot = '/repo';
    const client = createPiReviewMockClient({
      repoRoot,
      markdown: '# Review\n\nAll good.',
    });
    const result = await client.review({
      repoRoot,
      prompt: 'p',
      promptVersion: 'review-pr.v2',
      subject: 's',
      inputEventId: 'e1',
      gitlab: { projectId: 1, mergeRequestIid: 2 },
    });
    expect(result.markdown).toContain('All good');
    expect(result.command).toBe('fixture');
  });
});
