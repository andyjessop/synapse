import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import {
  registerAdapterMethods,
  SCENARIO_RUN_ID_HEADER,
} from 'runtime-adapters';
import { parseRuntimeManifestFile } from 'runtime-manifest';
import { describe, expect, it } from 'vitest';
import { shippedAdapters } from '../../src/shipped-adapters.js';

const gitlabAdapter = shippedAdapters.find(
  (source) => source.source === 'synapse.adapters.gitlab.v1',
);
if (gitlabAdapter === undefined) {
  throw new Error('gitlab adapter missing from shippedAdapters');
}
const gitlabFetchChangesMethod = gitlabAdapter.methods.fetchChanges;

import { mountDevScenarioRunRoutes } from '../../src/routes/dev-scenario-runs.js';
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
  const observability = {
    tracer: {
      startSpan: () => ({
        end: () => {},
        setStatus: () => {},
        recordException: () => {},
      }),
    },
    metrics: { recordAdapter: () => {} },
  } as never;

  const app = new Hono();
  mountInvokeRoutes(app, {
    manifest,
    liveDeps: {},
    observability,
    maxBodyBytes: 1_000_000,
  });
  mountDevScenarioRunRoutes(app, { manifest });
  return app;
}

describe('scenario adapter FIFO', () => {
  it('dequeues fixtures in order for the same match key', async () => {
    clearScenarioRunsForTest();
    const app = createTestApp();
    const scenarioRunId = installScenarioRun({
      scenarioId: 'test/fifo',
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

    const invoke = async () => {
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
      expect(res.status).toBe(200);
      return (await res.json()) as { result: { changes: unknown[] } };
    };

    const first = await invoke();
    expect(first.result.changes).toEqual([]);

    const second = await invoke();
    expect(second.result.changes).toHaveLength(1);

    clearScenarioRunsForTest();
  });

  it('validates install atomically', async () => {
    clearScenarioRunsForTest();
    const app = createTestApp();
    const res = await app.request('/v1/dev/scenario-runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scenarioId: 'bad',
        adapters: [
          {
            source: 'synapse.adapters.gitlab.v1',
            method: 'fetchChanges',
            params: { projectId: 'x' },
            returns: { project_id: 202, merge_request_iid: 42, changes: [] },
          },
        ],
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('adapter_params_invalid');
    clearScenarioRunsForTest();
  });
});

describe('method registry', () => {
  it('includes gitlab fetchChanges', () => {
    const registry = registerAdapterMethods(gitlabFetchChangesMethod);
    expect(
      registry.get('synapse.adapters.gitlab.v1', 'fetchChanges'),
    ).toBeDefined();
  });
});
