import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createPiReviewFixtureClient } from '../../src/pi-review-fixture-client';

describe('createPiReviewFixtureClient', () => {
  it('reads markdown from fixture path', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'synapse-pi-fixture-'));
    await writeFile(join(repoRoot, 'out.md'), 'ok', 'utf8');
    const client = createPiReviewFixtureClient({
      repoRoot,
      fixtureFile: 'out.md',
    });
    const result = await client.review({
      repoRoot,
      prompt: 'p',
      promptVersion: 'review-pr.v2',
      subject: 's',
      inputEventId: 'e',
      gitlab: { projectId: 202, mergeRequestIid: 42 },
    });
    expect(result.markdown).toBe('ok');
    expect(result.command).toBe('fixture');
  });
});
