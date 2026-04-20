import { afterEach, describe, expect, it, vi } from 'vitest';

const queueClose = vi.fn<() => Promise<void>>();
const queueGetWorkersCount = vi.fn<() => Promise<number>>();
const redisQuit = vi.fn<() => Promise<void>>();

vi.mock('bullmq', () => ({
  Queue: vi.fn(function Queue() {
    return {
      getWorkersCount: queueGetWorkersCount,
      close: queueClose,
    };
  }),
}));

vi.mock('ioredis', () => ({
  default: vi.fn(function IORedis() {
    return { quit: redisQuit };
  }),
}));

const {
  assertDevRuntimeAppsRunning,
  DEV_RUNTIME_WORKER_QUEUE_NAME,
  probeDevRuntimeApps,
} = await import('../../src/dev-runtime-apps');
const { parseRuntimeConfig } = await import('runtime-config');

afterEach(() => {
  vi.restoreAllMocks();
  queueClose.mockReset();
  queueGetWorkersCount.mockReset();
  redisQuit.mockReset();
});

describe('probeDevRuntimeApps', () => {
  const config = parseRuntimeConfig({});

  it('reports worker up when BullMQ probe succeeds', async () => {
    const status = await probeDevRuntimeApps(config, {
      probeWorkerQueue: async () => true,
      delayMs: async () => undefined,
      workerProbeAttempts: 1,
      workerProbeDelayMs: 0,
    });

    expect(status).toEqual({ worker: true });
  });

  it('retries the worker BullMQ probe before reporting down', async () => {
    const probeWorkerQueue = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const delayMs = vi.fn<() => Promise<void>>();

    const status = await probeDevRuntimeApps(config, {
      probeWorkerQueue,
      delayMs,
      workerProbeAttempts: 3,
      workerProbeDelayMs: 10,
    });

    expect(status.worker).toBe(true);
    expect(probeWorkerQueue).toHaveBeenCalledTimes(2);
    expect(probeWorkerQueue).toHaveBeenCalledWith(
      config.redisUrl,
      DEV_RUNTIME_WORKER_QUEUE_NAME,
    );
    expect(delayMs).toHaveBeenCalledWith(10);
  });

  it('throws DevRuntimeAppsNotRunningError listing missing apps', async () => {
    await expect(
      assertDevRuntimeAppsRunning(config, {
        probeWorkerQueue: async () => false,
        delayMs: async () => undefined,
        workerProbeAttempts: 1,
        workerProbeDelayMs: 0,
      }),
    ).rejects.toMatchObject({
      name: 'DevRuntimeAppsNotRunningError',
      missing: ['worker'],
      message: expect.stringContaining('npm run dev'),
    });
  });
});
