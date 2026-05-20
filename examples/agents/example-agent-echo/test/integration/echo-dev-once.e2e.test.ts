import {
  integrationInfraAvailable,
  runDevOnce,
  withTestDevServer,
} from 'agent-test-harness';
import { join } from 'node:path';

import { getRepoRoot } from 'runtime-config';
import { eventRegistry } from 'runtime-events';
import { describe, expect, it } from 'vitest';
import { shippedAgentsByName } from '../../../../../apps/worker/src/shipped-agents.js';

const knownEventTypes = new Set(Object.keys(eventRegistry));

describe.skipIf(!integrationInfraAvailable)(
  'example-echo runDevOnce (e2e)',
  () => {
    it('scenario example/echo → example.pong.v1', async () => {
      const repoRoot = getRepoRoot(import.meta.url);
      await withTestDevServer(
        {
          manifestPath: 'manifests/examples/echo.json',
          repoRoot,
          shippedAgents: shippedAgentsByName,
          knownEventTypes,
        },
        async (dev) => {
          const artifact = await runDevOnce({
            repoRoot,
            scenarioId: 'example/echo',
            manifestPath: join(repoRoot, 'manifests/examples/echo.json'),
            env: dev.env,
          });

          expect(artifact.status).toBe('succeeded');
          expect(artifact.events.map((e) => e.type)).toContain(
            'example.pong.v1',
          );
        },
      );
    });
  },
  120_000,
);
