import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { SCENARIO_RUN_ID_HEADER } from 'runtime-adapters';
import { parseRuntimeManifestFile } from 'runtime-manifest';
import { initializeObservability } from 'runtime-observability';
import { describe, expect, it } from 'vitest';

import { mountInvokeRoutes } from '../../src/routes/invoke.js';

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

describe('stale scenario run binding', () => {
  it('returns adapter_scenario_run_unknown when scenario header references missing run', async () => {
    const app = createTestApp();
    const res = await app.request(
      '/v1/adapters/synapse.adapters.gitlab.v1/fetchChanges',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SCENARIO_RUN_ID_HEADER]: 'scnrun_stale_binding_not_installed',
        },
        body: JSON.stringify({
          params: { projectId: 202, mergeRequestIid: 42 },
        }),
      },
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe('adapter_scenario_run_unknown');
    expect(body.error.message).toContain('dev:once');
    expect(body.error.message).toContain('active-scenario-run.json');
  });
});
