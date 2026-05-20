import { initializeObservability } from 'runtime-observability';
import { describe, expect, it, vi } from 'vitest';
import type { PollRegistrar } from '../../src/polling/poll-source-registry.js';
import * as pollRegistry from '../../src/polling/poll-source-registry.js';
import type { PollLockClient } from '../../src/polling/redis-poll-lock.js';
import { runPollSource } from '../../src/polling/run-poll-source.js';

const pollSourceId = 'synapse.poll.example-in-memory-heartbeat.v1';

describe('runPollSource', () => {
  it('returns lock_held summary when lock is not acquired', async () => {
    const observability = initializeObservability({
      serviceName: 'ingress-test',
      mode: 'test',
    });
    const redis: PollLockClient = {
      set: vi.fn().mockResolvedValue(null),
      eval: vi.fn().mockResolvedValue(0),
      quit: vi.fn().mockResolvedValue('OK'),
      disconnect: vi.fn(),
    };

    const outcome = await runPollSource(
      {
        resolved: {
          id: pollSourceId,
          intervalMs: 60_000,
          lockTtlMs: 55_000,
          lockKey: 'test-lock',
          enabled: true,
          params: { maxCandidates: 1 },
          owner: 'example-echo',
        },
        invocation: 'manual-http',
        pool: {} as never,
        repoRoot: '/tmp',
        redisUrl: 'redis://127.0.0.1:9',
        env: {},
        observability,
      },
      redis,
    );
    await observability.shutdown();

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.summary.skipReasons?.lock_held).toBe(1);
      expect(outcome.summary.emitted).toBe(0);
      expect(outcome.summary.rootEventIds).toEqual([]);
    }
  });

  it('returns registrar summary with event ids when lock is acquired', async () => {
    const observability = initializeObservability({
      serviceName: 'ingress-test',
      mode: 'test',
    });
    const redis: PollLockClient = {
      set: vi.fn().mockResolvedValue('OK'),
      eval: vi.fn().mockResolvedValue(1),
      quit: vi.fn().mockResolvedValue('OK'),
      disconnect: vi.fn(),
    };
    const registrar = vi.fn().mockResolvedValue({
      emitted: 1,
      skipped: 0,
      failed: 0,
      rootEventIds: ['evt_from_registrar'],
    });
    const originalRegistrar = pollRegistry.POLL_SOURCE_REGISTRARS[pollSourceId];
    pollRegistry.POLL_SOURCE_REGISTRARS[pollSourceId] =
      registrar as unknown as PollRegistrar;

    const outcome = await runPollSource(
      {
        resolved: {
          id: pollSourceId,
          intervalMs: 60_000,
          lockTtlMs: 55_000,
          lockKey: 'test-lock',
          enabled: true,
          params: { maxCandidates: 1 },
          owner: 'example-echo',
        },
        invocation: 'manual-http',
        pool: {} as never,
        repoRoot: '/tmp',
        redisUrl: 'redis://127.0.0.1:9',
        candidates: [{ message: 'x' }],
        env: {},
        observability,
      },
      redis,
    );
    pollRegistry.POLL_SOURCE_REGISTRARS[pollSourceId] = originalRegistrar;
    await observability.shutdown();

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.summary.rootEventIds).toEqual(['evt_from_registrar']);
      expect(registrar).toHaveBeenCalled();
    }
    expect(redis.eval).toHaveBeenCalled();
  });

  it('maps registrar throw to ok false and still releases lock', async () => {
    const observability = initializeObservability({
      serviceName: 'ingress-test',
      mode: 'test',
    });
    const redis: PollLockClient = {
      set: vi.fn().mockResolvedValue('OK'),
      eval: vi.fn().mockResolvedValue(1),
      quit: vi.fn().mockResolvedValue('OK'),
      disconnect: vi.fn(),
    };
    const originalRegistrar = pollRegistry.POLL_SOURCE_REGISTRARS[pollSourceId];
    pollRegistry.POLL_SOURCE_REGISTRARS[pollSourceId] = vi
      .fn()
      .mockRejectedValue(
        new Error('registrar boom'),
      ) as unknown as PollRegistrar;

    const outcome = await runPollSource(
      {
        resolved: {
          id: pollSourceId,
          intervalMs: 60_000,
          lockTtlMs: 55_000,
          lockKey: 'test-lock',
          enabled: true,
          params: {},
          owner: 'example-echo',
        },
        invocation: 'interval',
        pool: {} as never,
        repoRoot: '/tmp',
        redisUrl: 'redis://127.0.0.1:9',
        env: {},
        observability,
      },
      redis,
    );
    pollRegistry.POLL_SOURCE_REGISTRARS[pollSourceId] = originalRegistrar;
    await observability.shutdown();

    expect(outcome.ok).toBe(false);
    expect(redis.eval).toHaveBeenCalled();
  });
});
