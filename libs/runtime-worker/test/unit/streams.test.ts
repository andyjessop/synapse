import type { Queue } from 'bullmq';
import type { RuntimeStore } from 'runtime-store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearTerminalReactorJobIfPresent,
  REACTOR_JOB_NAME,
  startQueueingStream,
} from '../../src/streams';

describe('startQueueingStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls queue.add before markRunQueued', async () => {
    const order: string[] = [];
    const store = {
      loadPendingRuns: vi.fn().mockResolvedValue([{ id: 'run_evt__agent__r' }]),
      markRunQueued: vi.fn(async () => {
        order.push('markRunQueued');
      }),
    } satisfies Pick<RuntimeStore, 'loadPendingRuns' | 'markRunQueued'>;
    const queue = {
      getJob: vi.fn().mockResolvedValue(undefined),
      add: vi.fn(async () => {
        order.push('queue.add');
        return {};
      }),
    } satisfies Pick<Queue, 'add' | 'getJob'>;

    const subscription = startQueueingStream({
      store: store as RuntimeStore,
      queue,
      logger: { error: () => {}, warn: () => {} },
      intervalMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(0);
    subscription.unsubscribe();

    expect(order.slice(0, 2)).toEqual(['queue.add', 'markRunQueued']);
    expect(queue.add).toHaveBeenCalledWith(
      REACTOR_JOB_NAME,
      { runId: 'run_evt__agent__r' },
      expect.objectContaining({
        jobId: 'run_evt__agent__r',
        removeOnFail: true,
      }),
    );
  });

  it('removes a failed BullMQ job before re-adding the same run id', async () => {
    const remove = vi.fn();
    const store = {
      loadPendingRuns: vi.fn().mockResolvedValue([{ id: 'run_evt__agent__r' }]),
      markRunQueued: vi.fn(),
    } satisfies Pick<RuntimeStore, 'loadPendingRuns' | 'markRunQueued'>;
    const queue = {
      getJob: vi.fn().mockResolvedValue({
        getState: vi.fn().mockResolvedValue('failed'),
        remove,
      }),
      add: vi.fn(async () => ({})),
    } satisfies Pick<Queue, 'add' | 'getJob'>;

    const subscription = startQueueingStream({
      store: store as RuntimeStore,
      queue,
      logger: { error: () => {}, warn: () => {} },
      intervalMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(0);
    subscription.unsubscribe();

    expect(remove).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalled();
  });

  it('skips queue.add when the job is already waiting', async () => {
    const store = {
      loadPendingRuns: vi.fn().mockResolvedValue([{ id: 'run_evt__agent__r' }]),
      markRunQueued: vi.fn(),
    } satisfies Pick<RuntimeStore, 'loadPendingRuns' | 'markRunQueued'>;
    const queue = {
      getJob: vi.fn().mockResolvedValue({
        getState: vi.fn().mockResolvedValue('waiting'),
        remove: vi.fn(),
      }),
      add: vi.fn(),
    } satisfies Pick<Queue, 'add' | 'getJob'>;

    const subscription = startQueueingStream({
      store: store as RuntimeStore,
      queue,
      logger: { error: () => {}, warn: () => {} },
      intervalMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(0);
    subscription.unsubscribe();

    expect(queue.add).not.toHaveBeenCalled();
    expect(store.markRunQueued).toHaveBeenCalled();
  });

  it('leaves the run pending when markRunQueued fails after queue.add', async () => {
    const store = {
      loadPendingRuns: vi.fn().mockResolvedValue([{ id: 'run_evt__agent__r' }]),
      markRunQueued: vi.fn(async () => {
        throw new Error('mark queued failed');
      }),
    } satisfies Pick<RuntimeStore, 'loadPendingRuns' | 'markRunQueued'>;
    const queue = {
      getJob: vi.fn().mockResolvedValue(undefined),
      add: vi.fn(async () => ({})),
    } satisfies Pick<Queue, 'add' | 'getJob'>;
    const warn = vi.fn();

    const subscription = startQueueingStream({
      store: store as RuntimeStore,
      queue,
      logger: { error: () => {}, warn },
      intervalMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(0);
    subscription.unsubscribe();

    expect(queue.add).toHaveBeenCalled();
    expect(store.markRunQueued).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});

describe('clearTerminalReactorJobIfPresent', () => {
  it('returns absent when there is no job', async () => {
    const queue = { getJob: vi.fn().mockResolvedValue(undefined) };
    await expect(
      clearTerminalReactorJobIfPresent(queue, 'run_x'),
    ).resolves.toBe('absent');
  });
});
