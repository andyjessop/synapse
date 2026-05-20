import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRuntimeManifestFile } from 'runtime-manifest';
import { listScenariosForManifest } from 'synapse-scenarios';
import { describe, expect, it } from 'vitest';

import { collectAgentWebhookFixturePaths } from '../../src/index.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('discover agent fixtures', () => {
  it('lists scenarios whose manifests[] includes the active manifest', () => {
    const manifest = parseRuntimeManifestFile(
      join(repoRoot, 'manifests/application.json'),
    );
    const entries = listScenariosForManifest(repoRoot, manifest);
    const ids = entries.map((e) => e.id).sort();
    expect(ids).toEqual(['review-pr/gitlab-synapse']);
  });

  it('collectAgentWebhookFixturePaths does not auto-discover legacy fixtures', () => {
    const agent = {
      name: 'agent-reviewer',
    };
    expect(collectAgentWebhookFixturePaths(agent, repoRoot)).toEqual([]);
  });
});
