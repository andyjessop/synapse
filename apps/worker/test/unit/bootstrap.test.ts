import { describe, expect, it, vi } from 'vitest';

const poolEnd = vi.fn().mockResolvedValue(undefined);
const observabilityShutdown = vi.fn().mockResolvedValue(undefined);

vi.mock('runtime-config', () => ({
  getRepoRoot: () => '/repo',
  loadDotEnvLocal: (_path: string, env: Record<string, string | undefined>) =>
    env,
  parseRuntimeConfig: () => ({
    databaseUrl: 'postgresql://synapse:synapse@127.0.0.1:25432/synapse',
    redisUrl: 'redis://127.0.0.1:26379',
  }),
}));

vi.mock('runtime-observability', () => ({
  initializeObservability: vi.fn(() => ({
    tracer: {},
    shutdown: observabilityShutdown,
  })),
}));

vi.mock('runtime-store', () => ({
  createRuntimeStorePool: vi.fn(() => ({ end: poolEnd })),
  createRuntimeStore: vi.fn(() => ({})),
  migrateRuntimeStore: vi.fn().mockRejectedValue(new Error('migrate failed')),
}));

vi.mock('runtime-worker', () => ({
  createRuntimeRegistry: vi.fn(() => ({})),
  defineIngress: vi.fn((ingress) => ingress),
  executeRunFromJobData: vi.fn(),
  REACTOR_JOB_NAME: 'reactor.run',
  REACTOR_QUEUE_NAME: 'reactor-runs',
  startPlanningStream: vi.fn(),
  startQueueingStream: vi.fn(),
  startRepairStream: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn(),
  Worker: vi.fn(),
}));

vi.mock('ioredis', () => ({
  default: vi.fn(),
}));

vi.mock('../../src/manifest-registry', () => ({
  loadWorkerManifestRegistry: vi.fn(async () => ({
    registry: {},
    manifest: {
      name: 'test',
      manifestPath: '/repo/manifests/application.json',
    },
    manifestPath: '/repo/manifests/application.json',
  })),
}));

const { bootstrapWorker } = await import('../../src/main');

describe('bootstrapWorker', () => {
  it('disposes the pool and observability when migration fails', async () => {
    await expect(
      bootstrapWorker({
        DATABASE_URL: 'postgresql://synapse:synapse@127.0.0.1:25432/synapse',
      }),
    ).rejects.toThrow('migrate failed');
    expect(poolEnd).toHaveBeenCalled();
    expect(observabilityShutdown).toHaveBeenCalled();
  });
});
