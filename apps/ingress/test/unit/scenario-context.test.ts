import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createIngressApp } from '../../src/app.js';
import * as runPollSourceModule from '../../src/polling/run-poll-source.js';
import { clearScenarioContextStoreForTest } from '../../src/scenario/scenario-context-store.js';

const repoRoot = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../..',
);

describe('scenario context', () => {
  it('does not mount /v1/dev/scenario-context without SYNAPSE_DEV_SCENARIO_CONTEXT', async () => {
    const { app } = createIngressApp({
      pool: {} as never,
      redisUrl: 'redis://127.0.0.1:9',
      webhookRouteIds: [],
      manifestPath: join(repoRoot, 'manifests/examples/echo.json'),
      repoRoot,
      env: {},
    });

    const response = await app.request('/v1/dev/scenario-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioFixtureContext: {
          scenarioId: 'example/echo',
          adapters: [],
        },
      }),
    });

    expect(response.status).toBe(404);
  });

  it('POST /v1/dev/scenario-context returns contextId', async () => {
    clearScenarioContextStoreForTest();
    const { app } = createIngressApp({
      pool: {} as never,
      redisUrl: 'redis://127.0.0.1:9',
      webhookRouteIds: [],
      manifestPath: join(repoRoot, 'manifests/examples/echo.json'),
      repoRoot,
      env: { SYNAPSE_DEV_SCENARIO_CONTEXT: '1' },
    });

    const response = await app.request('/v1/dev/scenario-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioFixtureContext: {
          scenarioId: 'example/echo-poll',
          adapters: [],
        },
      }),
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as { contextId: string };
    expect(json.contextId).toMatch(/^scnctx_/);
  });

  it('rejects reuse of a consumed scenario context id', async () => {
    clearScenarioContextStoreForTest();
    const { app } = createIngressApp({
      pool: {} as never,
      redisUrl: 'redis://127.0.0.1:9',
      webhookRouteIds: ['synapse.webhooks.example-echo-ping.v1'],
      manifestPath: join(repoRoot, 'manifests/examples/echo.json'),
      repoRoot,
      env: { SYNAPSE_DEV_SCENARIO_CONTEXT: '1' },
    });

    const install = await app.request('/v1/dev/scenario-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioFixtureContext: {
          scenarioId: 'example/echo',
          adapters: [],
        },
      }),
    });
    const { contextId } = (await install.json()) as { contextId: string };

    const first = await app.request('/v1/examples/echo/ping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Synapse-Scenario-Context-Id': contextId,
      },
      body: JSON.stringify({ message: 'once' }),
    });
    expect(first.status).not.toBe(400);

    const second = await app.request('/v1/examples/echo/ping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Synapse-Scenario-Context-Id': contextId,
      },
      body: JSON.stringify({ message: 'twice' }),
    });
    expect(second.status).toBe(400);
  });

  it('poll tick passes scenarioFixtureContext to runPollSource', async () => {
    const runPollSource = vi
      .spyOn(runPollSourceModule, 'runPollSource')
      .mockResolvedValue({
        ok: true,
        summary: {
          sourceId: 'synapse.poll.example-in-memory-heartbeat.v1',
          emitted: 1,
          skipped: 0,
          failed: 0,
          durationMs: 1,
          rootEventIds: ['evt_poll_scenario'],
        },
      });

    const { app } = createIngressApp({
      pool: {} as never,
      redisUrl: 'redis://127.0.0.1:9',
      webhookRouteIds: [],
      manifestPath: join(repoRoot, 'manifests/examples/echo-poll.json'),
      repoRoot,
      env: { SYNAPSE_DEV_SCENARIO_CONTEXT: '1' },
    });

    const response = await app.request(
      '/v1/poll/synapse.poll.example-in-memory-heartbeat.v1/tick',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioFixtureContext: {
            scenarioId: 'example/echo-poll',
            ingressFixture: [{ message: 'from-scenario' }],
          },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(runPollSource).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarioFixtureContext: {
          scenarioId: 'example/echo-poll',
          ingressFixture: [{ message: 'from-scenario' }],
        },
      }),
    );
    vi.restoreAllMocks();
  });
});
