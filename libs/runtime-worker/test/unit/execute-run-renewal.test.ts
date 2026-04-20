import { defineAgent, defineReactor } from 'runtime-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeRun,
  REACTOR_RUN_LOCK_RENEW_INTERVAL_MS,
} from '../../src/execute-run';
import { createRuntimeRegistry } from '../../src/registry';

describe('executeRun lock renewal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls renewRunLock on the fixed interval while the handler runs', async () => {
    let resolveHandler!: () => void;
    const handlerDone = new Promise<void>((resolve) => {
      resolveHandler = resolve;
    });
    const renewRunLock = vi.fn().mockResolvedValue(true);
    const store = {
      claimRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        inputEventId: 'evt-1',
        agentName: 'agent',
        reactorName: 'r',
        status: 'running',
        attemptCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      loadEvent: vi.fn().mockResolvedValue({
        id: 'evt-1',
        type: 'example.ping.v1',
        source: 'test',
        externalId: 'ext',
        data: {},
        rootId: 'evt-1',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      renewRunLock,
      markRunSucceeded: vi.fn(),
      markRunFailed: vi.fn(),
    };
    const registry = createRuntimeRegistry([
      defineAgent({
        name: 'agent',
        reactors: [
          defineReactor({
            name: 'r',
            subscribesTo: ['example.ping.v1'],
            handler: async () => {
              await handlerDone;
            },
          }),
        ],
      }),
    ]);

    const runPromise = executeRun('run-1', {
      store: store as never,
      registry,
      lockRenewIntervalMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(renewRunLock).toHaveBeenCalledWith('run-1', 120_000);

    resolveHandler();
    await runPromise;
    expect(store.markRunSucceeded).toHaveBeenCalledWith('run-1');
  });

  it('exports a 60s production renewal interval', () => {
    expect(REACTOR_RUN_LOCK_RENEW_INTERVAL_MS).toBe(60_000);
  });
});
