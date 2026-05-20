import { describe, expect, it } from 'vitest';
import { assertPollIngressRedisUrl, createIngressApp } from '../../src/app.js';

describe('poll ingress app deps', () => {
  it('assertPollIngressRedisUrl throws when poll sources need redis', () => {
    expect(() =>
      assertPollIngressRedisUrl(
        [
          {
            id: 'synapse.poll.example-in-memory-heartbeat.v1',
            intervalMs: 60_000,
            lockTtlMs: 55_000,
            lockKey: 'k',
            enabled: true,
            params: {},
            owner: 'example-echo',
          },
        ],
        undefined,
      ),
    ).toThrow(/redisUrl/i);
  });

  it('exposes lazy startPollSupervisors without mounting during app creation', () => {
    const { startPollSupervisors } = createIngressApp({
      pool: {} as never,
      redisUrl: 'redis://127.0.0.1:9',
      webhookRouteIds: [],
      resolvedPollSources: [
        {
          id: 'synapse.poll.example-in-memory-heartbeat.v1',
          intervalMs: 60_000,
          lockTtlMs: 55_000,
          lockKey: 'k',
          enabled: true,
          params: {},
          owner: 'example-echo',
        },
      ],
      env: {},
    });
    const subs = startPollSupervisors({ startImmediately: false });
    expect(subs).toHaveLength(1);
    subs[0]?.unsubscribe();
  });
});
