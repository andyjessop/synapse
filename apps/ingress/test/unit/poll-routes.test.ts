import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createIngressApp } from '../../src/app.js';
import * as runPollSourceModule from '../../src/polling/run-poll-source.js';

const repoRoot = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../..',
);

describe('poll routes', () => {
  it('POST /v1/poll/:sourceId/inject is not mounted', async () => {
    const { app } = createIngressApp({
      pool: {} as never,
      redisUrl: 'redis://127.0.0.1:9',
      webhookRouteIds: [],
      manifestPath: join(repoRoot, 'manifests/examples/echo-poll.json'),
      repoRoot,
      env: {},
    });

    const response = await app.request(
      '/v1/poll/synapse.poll.example-in-memory-heartbeat.v1/inject',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidates: [{ message: 'poll-test' }],
        }),
      },
    );

    expect(response.status).toBe(404);
  });

  it('POST /tick returns 500 when runPollSource fails', async () => {
    vi.spyOn(runPollSourceModule, 'runPollSource').mockResolvedValue({
      ok: false,
      sourceId: 'synapse.poll.example-in-memory-heartbeat.v1',
      error: { code: 'tick_error', message: 'boom' },
      durationMs: 1,
    });

    const { app } = createIngressApp({
      pool: {} as never,
      redisUrl: 'redis://127.0.0.1:9',
      webhookRouteIds: [],
      resolvedPollSources: [
        {
          id: 'synapse.poll.example-in-memory-heartbeat.v1',
          intervalMs: 60_000,
          lockTtlMs: 55_000,
          lockKey: 'test',
          enabled: true,
          params: {},
          owner: 'example-echo',
        },
      ],
      env: {},
    });

    const response = await app.request(
      '/v1/poll/synapse.poll.example-in-memory-heartbeat.v1/tick',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
    );

    expect(response.status).toBe(500);
    vi.restoreAllMocks();
  });

  it('POST /tick rejects scenarioFixtureContext when dev scenario mode is off', async () => {
    const { app } = createIngressApp({
      pool: {} as never,
      redisUrl: 'redis://127.0.0.1:9',
      webhookRouteIds: [],
      resolvedPollSources: [
        {
          id: 'synapse.poll.example-in-memory-heartbeat.v1',
          intervalMs: 60_000,
          lockTtlMs: 55_000,
          lockKey: 'test',
          enabled: true,
          params: {},
          owner: 'example-echo',
        },
      ],
      env: { NODE_ENV: 'production' },
    });

    const response = await app.request(
      '/v1/poll/synapse.poll.example-in-memory-heartbeat.v1/tick',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioFixtureContext: {
            scenarioId: 'example/echo-poll',
            adapters: [],
          },
        }),
      },
    );

    expect(response.status).toBe(400);
    const json = (await response.json()) as {
      error: { code: string };
    };
    expect(json.error.code).toBe('scenario_context_disabled');
  });

  it('POST /tick returns 404 for disabled poll source', async () => {
    const { app } = createIngressApp({
      pool: {} as never,
      redisUrl: 'redis://127.0.0.1:9',
      webhookRouteIds: [],
      resolvedPollSources: [
        {
          id: 'synapse.poll.example-in-memory-heartbeat.v1',
          intervalMs: 60_000,
          lockTtlMs: 55_000,
          lockKey: 'test',
          enabled: false,
          params: {},
          owner: 'example-echo',
        },
      ],
      env: {},
    });

    const response = await app.request(
      '/v1/poll/synapse.poll.example-in-memory-heartbeat.v1/tick',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
    );

    expect(response.status).toBe(404);
  });
});
