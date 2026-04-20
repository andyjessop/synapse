import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runDevOnce } from '../../src/run-dev-once.js';

describe('runDevOnce', () => {
  it('requires .synapse/dev-session.json before ingress', async () => {
    const repoRoot = mkdtempSync(
      join(tmpdir(), 'synapse-run-dev-once-no-session-'),
    );
    await expect(
      runDevOnce({ repoRoot, fixtureId: 'review-pr/gitlab-synapse' }),
    ).rejects.toThrow(/Missing \.synapse\/dev-session\.json/);
  });
});
