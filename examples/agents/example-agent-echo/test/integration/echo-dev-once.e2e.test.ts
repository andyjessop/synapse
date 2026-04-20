import {
  integrationInfraAvailable,
  runDevOnce,
  withTestDevServer,
} from 'agent-test-harness';
import { getRepoRoot } from 'runtime-config';
import { describe, expect, it } from 'vitest';

describe.skipIf(!integrationInfraAvailable)(
  'example-echo runDevOnce (e2e)',
  () => {
    it('fixture example/echo → example.pong.v1', async () => {
      const repoRoot = getRepoRoot(import.meta.url);
      await withTestDevServer(
        { manifestPath: 'manifests/examples/echo.json', repoRoot },
        async (dev) => {
          const artifact = await runDevOnce({
            repoRoot,
            fixtureId: 'example/echo',
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
