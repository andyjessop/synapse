import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { SCENARIO_RUN_ID_HEADER } from 'runtime-adapters';
import { parseRuntimeManifestFile } from 'runtime-manifest';
import { initializeObservability } from 'runtime-observability';
import { describe, expect, it } from 'vitest';

import { mountInvokeRoutes } from '../../src/routes/invoke.js';
import {
  clearScenarioRunsForTest,
  installScenarioRun,
} from '../../src/scenario/scenario-run-store.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));
const manifest = parseRuntimeManifestFile(
  join(repoRoot, 'manifests/application.json'),
);

function createTestApp() {
  const app = new Hono();
  mountInvokeRoutes(app, {
    manifest,
    liveDeps: {},
    observability: initializeObservability({
      serviceName: 'adapters',
      mode: 'test',
    }),
    maxBodyBytes: 1_000_000,
  });
  return app;
}

/**
 * Simulates ingress then worker sharing one scenarioRunId against apps/adapters
 * (the spec's cross-process FIFO acceptance case).
 */
describe('cross-process scenario FIFO via apps/adapters', () => {
  it('ingress consumes first fixture and worker consumes second', async () => {
    clearScenarioRunsForTest();
    const app = createTestApp();
    const scenarioRunId = installScenarioRun({
      scenarioId: 'review-pr/gitlab-synapse',
      adapters: [
        {
          source: 'synapse.adapters.gitlab.v1',
          method: 'fetchChanges',
          params: { projectId: 202, mergeRequestIid: 42 },
          returns: { project_id: 202, merge_request_iid: 42, changes: [] },
        },
        {
          source: 'synapse.adapters.gitlab.v1',
          method: 'fetchChanges',
          params: { projectId: 202, mergeRequestIid: 42 },
          returns: {
            project_id: 202,
            merge_request_iid: 42,
            changes: [{ old_path: 'a', new_path: 'a', diff: 'd' }],
          },
        },
      ],
    });

    const invoke = async (label: string) => {
      const res = await app.request(
        '/v1/adapters/synapse.adapters.gitlab.v1/fetchChanges',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [SCENARIO_RUN_ID_HEADER]: scenarioRunId,
          },
          body: JSON.stringify({
            params: { projectId: 202, mergeRequestIid: 42 },
          }),
        },
      );
      expect(res.status, `${label} status`).toBe(200);
      return (await res.json()) as { result: { changes: unknown[] } };
    };

    const ingressResult = await invoke('ingress');
    expect(ingressResult.result.changes).toEqual([]);

    const workerResult = await invoke('worker');
    expect(workerResult.result.changes).toHaveLength(1);

    clearScenarioRunsForTest();
  });
});
