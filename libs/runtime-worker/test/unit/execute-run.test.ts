import { defineReactor, defineRegistryAgent } from 'runtime-agent';
import { describe, expect, it, vi } from 'vitest';
import { executeRun } from '../../src/execute-run';
import { createRuntimeRegistry } from '../../src/registry';

describe('executeRun', () => {
  it('ignores malformed or empty run ids from BullMQ', async () => {
    const store = {
      claimRun: vi.fn(),
    };
    const registry = createRuntimeRegistry([
      defineRegistryAgent({
        name: 'agent',
        reactors: [
          defineReactor({
            name: 'r',
            subscribesTo: ['example.ping.v1'],
            handler: async () => {},
          }),
        ],
      }),
    ]);
    await expect(
      executeRun('', { store: store as never, registry }),
    ).rejects.toThrow(/non-empty runId/);
    expect(store.claimRun).not.toHaveBeenCalled();
  });

  it('marks the run failed when loadEvent fails after claim', async () => {
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
      loadEvent: vi.fn().mockRejectedValue(new Error('missing event')),
      markRunFailed: vi.fn(),
      markRunSucceeded: vi.fn(),
    };
    const registry = createRuntimeRegistry([
      defineRegistryAgent({
        name: 'agent',
        reactors: [
          defineReactor({
            name: 'r',
            subscribesTo: ['example.ping.v1'],
            handler: async () => {},
          }),
        ],
      }),
    ]);
    await expect(
      executeRun('run-1', { store: store as never, registry }),
    ).rejects.toThrow(/missing event/);
    expect(store.markRunFailed).toHaveBeenCalledWith(
      'run-1',
      expect.any(Error),
      undefined,
    );
    expect(store.markRunSucceeded).not.toHaveBeenCalled();
  });

  it('marks the run failed when the reactor is not registered', async () => {
    const store = {
      claimRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        inputEventId: 'evt-1',
        agentName: 'agent',
        reactorName: 'missing',
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
      releaseRunForOtherWorker: vi.fn(),
      markRunFailed: vi.fn(),
      markRunSucceeded: vi.fn(),
    };
    const registry = createRuntimeRegistry([]);
    await expect(
      executeRun('run-1', { store: store as never, registry }),
    ).rejects.toThrow(/Missing agent registration/);
    expect(store.releaseRunForOtherWorker).not.toHaveBeenCalled();
    expect(store.markRunFailed).toHaveBeenCalled();
    expect(store.markRunSucceeded).not.toHaveBeenCalled();
  });

  it('releases the run when this worker does not mount the agent', async () => {
    const store = {
      claimRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        inputEventId: 'evt-1',
        agentName: 'agent-reviewer',
        reactorName: 'handler',
        status: 'running',
        attemptCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      loadEvent: vi.fn().mockResolvedValue({
        id: 'evt-1',
        type: 'pr.received.v1',
        source: 'test',
        externalId: 'ext',
        data: {},
        rootId: 'evt-1',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      releaseRunForOtherWorker: vi.fn().mockResolvedValue(true),
      markRunFailed: vi.fn(),
      markRunSucceeded: vi.fn(),
    };
    const registry = {
      findAgentsForEvent: () => [],
      matchReactors: () => [],
      getAgent: () => {
        throw new Error('Missing agent registration: agent-reviewer');
      },
      getReactor: () => {
        throw new Error('Missing agent registration: agent-reviewer');
      },
    };
    await executeRun('run-1', { store: store as never, registry });
    expect(store.releaseRunForOtherWorker).toHaveBeenCalledWith('run-1');
    expect(store.markRunFailed).not.toHaveBeenCalled();
    expect(store.markRunSucceeded).not.toHaveBeenCalled();
  });

  it('no-ops when claimRun returns null (stale or missing BullMQ job)', async () => {
    const store = {
      claimRun: vi.fn().mockResolvedValue(null),
      markRunFailed: vi.fn(),
      markRunSucceeded: vi.fn(),
    };
    const registry = createRuntimeRegistry([]);
    await executeRun('run-1', { store: store as never, registry });
    expect(store.markRunFailed).not.toHaveBeenCalled();
    expect(store.markRunSucceeded).not.toHaveBeenCalled();
  });
});
