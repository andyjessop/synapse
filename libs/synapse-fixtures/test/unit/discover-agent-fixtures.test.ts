import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRuntimeManifestFile } from 'runtime-manifest';
import { describe, expect, it } from 'vitest';

import {
  collectAgentWebhookFixturePaths,
  listManifestFixtures,
} from '../../src/index.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('discover agent fixtures', () => {
  it('lists all *.fixture.json under agent-reviewer', () => {
    const manifest = parseRuntimeManifestFile(
      join(repoRoot, 'manifests/application.json'),
    );
    const entries = listManifestFixtures(manifest, repoRoot);
    const ids = entries.map((e) => e.id).sort();
    expect(ids).toEqual(['review-pr/gitlab-synapse']);
  });

  it('collectAgentWebhookFixturePaths merges manifest paths and discovery', () => {
    const agent = {
      name: 'agent-reviewer',
      handler: 'agents/agent-reviewer/src/review-pr-agent.ts',
      handles: ['pr.received.v1'],
      fixtures: {
        webhook: [
          'fixtures/agent-reviewer/review-pr-gitlab-synapse.fixture.json',
        ],
        adapter: [],
      },
    };
    const paths = collectAgentWebhookFixturePaths(agent, repoRoot);
    expect(paths).toEqual([
      'fixtures/agent-reviewer/review-pr-gitlab-synapse.fixture.json',
    ]);
  });
});
