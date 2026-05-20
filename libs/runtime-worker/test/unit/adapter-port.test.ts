import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCENARIO_RUN_ID_HEADER } from 'runtime-adapters';
import { describe, expect, it, vi } from 'vitest';

import { createWorkerAdapterPort } from '../../src/adapter-port.js';

describe('createWorkerAdapterPort', () => {
  it('sends scenario run header from active-scenario-run.json', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'synapse-adapter-port-'));
    const scenarioRunId = 'scnrun_test_worker_binding';
    mkdirSync(join(repoRoot, 'tmp/dev'), { recursive: true });
    writeFileSync(
      join(repoRoot, 'tmp/dev/active-scenario-run.json'),
      JSON.stringify({
        scenarioRunId,
        scenarioId: 'review-pr/gitlab-synapse',
        startedAt: new Date().toISOString(),
      }),
      'utf8',
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ result: { ok: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const port = createWorkerAdapterPort({
      repoRoot,
      env: {
        ADAPTERS_BASE_URL: 'http://127.0.0.1:3104',
        SYNAPSE_DEV_SCENARIO_CONTEXT: '1',
      },
    });

    await port.invoke({
      agentName: 'agent-reviewer',
      source: 'synapse.adapters.gitlab.v1',
      method: 'fetchChanges',
      params: { projectId: 202, mergeRequestIid: 42 },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers[SCENARIO_RUN_ID_HEADER]).toBe(scenarioRunId);
    expect(init.headers['content-type']).toBe('application/json');

    vi.unstubAllGlobals();
  });

  it('does not send scenario header when dev scenario context is off', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'synapse-adapter-port-'));
    mkdirSync(join(repoRoot, 'tmp/dev'), { recursive: true });
    writeFileSync(
      join(repoRoot, 'tmp/dev/active-scenario-run.json'),
      JSON.stringify({
        scenarioRunId: 'scnrun_ignored',
        scenarioId: 'x',
        startedAt: new Date().toISOString(),
      }),
      'utf8',
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ result: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const port = createWorkerAdapterPort({
      repoRoot,
      env: { ADAPTERS_BASE_URL: 'http://127.0.0.1:3104' },
    });

    await port.invoke({
      agentName: 'agent-reviewer',
      source: 'synapse.adapters.gitlab.v1',
      method: 'fetchChanges',
      params: { projectId: 1, mergeRequestIid: 1 },
    });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers[SCENARIO_RUN_ID_HEADER]).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
