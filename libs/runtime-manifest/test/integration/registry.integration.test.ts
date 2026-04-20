import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  loadValidatedManifestRegistry,
  MANIFEST_HANDLER_REACTOR_NAME,
} from '../../src/index.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('loadValidatedManifestRegistry', () => {
  it('finds agent-reviewer for pr.received.v1 from application manifest', async () => {
    const { registry } = await loadValidatedManifestRegistry({
      repoRoot,
      manifestPath: join(repoRoot, 'manifests/application.json'),
    });
    const agents = registry.findAgentsForEvent('pr.received.v1');
    expect(agents).toHaveLength(1);
    expect(agents[0]?.agentName).toBe('agent-reviewer');
    expect(agents[0]?.reactorName).toBe(MANIFEST_HANDLER_REACTOR_NAME);
  });
});
