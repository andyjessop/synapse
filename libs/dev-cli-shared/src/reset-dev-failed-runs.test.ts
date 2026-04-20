import type { RuntimePool } from 'runtime-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getJob, remove, queueClose, connectionQuit } = vi.hoisted(() => ({
  getJob: vi.fn(),
  remove: vi.fn(),
  queueClose: vi.fn(),
  connectionQuit: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn(function MockQueue() {
    return {
      getJob,
      close: queueClose,
    };
  }),
}));

vi.mock('ioredis', () => ({
  default: vi.fn(function MockRedis() {
    return {
      quit: connectionQuit,
    };
  }),
}));

const { requeueFailedAgentRun } = vi.hoisted(() => ({
  requeueFailedAgentRun: vi.fn(),
}));

vi.mock('runtime-store', async (importOriginal) => {
  const mod = await importOriginal<typeof import('runtime-store')>();
  return {
    ...mod,
    requeueFailedAgentRun,
  };
});

import {
  removeReactorQueueJobs,
  resetFailedAgentRunsForRoot,
  retryDevFailedRunsOnRoot,
} from './reset-dev-failed-runs.js';

describe('resetFailedAgentRunsForRoot', () => {
  let pool: RuntimePool;

  beforeEach(() => {
    pool = {
      query: vi.fn(),
    } as unknown as RuntimePool;
  });

  it('requeues each failed run on the root', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rowCount: 1,
      rows: [{ id: 'run_evt_abc__agent-reviewer__review-pr' }],
    } as never);
    requeueFailedAgentRun.mockResolvedValue(true);

    const ids = await resetFailedAgentRunsForRoot(pool, 'evt_root');
    expect(ids).toEqual(['run_evt_abc__agent-reviewer__review-pr']);
    expect(requeueFailedAgentRun).toHaveBeenCalledWith(
      pool,
      'run_evt_abc__agent-reviewer__review-pr',
    );
  });
});

describe('removeReactorQueueJobs', () => {
  beforeEach(() => {
    getJob.mockReset();
    remove.mockReset();
    queueClose.mockReset();
    connectionQuit.mockReset();
  });

  it('removes existing jobs and skips missing ids', async () => {
    getJob.mockImplementation(async (id: string) =>
      id === 'run_a' ? { remove } : undefined,
    );

    await removeReactorQueueJobs('redis://127.0.0.1:26379', ['run_a', 'run_b']);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(queueClose).toHaveBeenCalled();
    expect(connectionQuit).toHaveBeenCalled();
  });
});

describe('retryDevFailedRunsOnRoot', () => {
  it('resets failed runs then clears BullMQ jobs', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{ id: 'run_evt_x__agent-reviewer__review-pr' }],
      }),
    } as unknown as RuntimePool;
    requeueFailedAgentRun.mockResolvedValue(true);
    getJob.mockResolvedValue({ remove });

    const ids = await retryDevFailedRunsOnRoot({
      pool,
      redisUrl: 'redis://127.0.0.1:26379',
      rootId: 'evt_root',
    });

    expect(ids).toEqual(['run_evt_x__agent-reviewer__review-pr']);
    expect(remove).toHaveBeenCalled();
  });
});
