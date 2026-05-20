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

describe('scenario mode never falls back to live', () => {
  it('returns 409 when fixture does not match instead of calling live', async () => {
    clearScenarioRunsForTest();
    const app = createTestApp();
    const scenarioRunId = installScenarioRun({
      scenarioId: 'test/no-match',
      adapters: [
        {
          source: 'synapse.adapters.gitlab.v1',
          method: 'fetchChanges',
          params: { projectId: 202, mergeRequestIid: 42 },
          returns: { project_id: 202, merge_request_iid: 42, changes: [] },
        },
      ],
    });

    const res = await app.request(
      '/v1/adapters/synapse.adapters.gitlab.v1/fetchChanges',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SCENARIO_RUN_ID_HEADER]: scenarioRunId,
        },
        body: JSON.stringify({
          params: { projectId: 999, mergeRequestIid: 1 },
        }),
      },
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('adapter_fixture_not_found');
    clearScenarioRunsForTest();
  });
});
