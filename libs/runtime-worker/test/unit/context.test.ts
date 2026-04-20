import { describe, expect, it, vi } from 'vitest';
import { createReactorContext } from '../../src/context';

describe('createReactorContext', () => {
  it('emits child events with agent source, root, parent, and inherited subject', async () => {
    const appendEvent = vi.fn(async (input) => ({
      id: 'evt_child',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...input,
      rootId: input.rootId ?? 'evt_child',
    }));
    const ctx = createReactorContext({
      run: {
        id: 'run_evt_root__agent__reactor',
        inputEventId: 'evt_root',
        agentName: 'agent',
        reactorName: 'reactor',
        status: 'running',
        attemptCount: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      event: {
        id: 'evt_root',
        type: 'example.ping.v1',
        source: 'test',
        externalId: 'root',
        subject: 'subject-1',
        data: {},
        rootId: 'evt_root',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      store: { appendEvent } as never,
    });

    await ctx.emit('example.pong.v1', { ok: true }, { externalId: 'child' });

    expect(ctx.run.attempt).toBe(2);
    expect(appendEvent).toHaveBeenCalledWith({
      type: 'example.pong.v1',
      data: { ok: true },
      source: 'agent://agent/reactor',
      externalId: 'child',
      subject: 'subject-1',
      rootId: 'evt_root',
      parentId: 'evt_root',
    });
  });

  it('requires options.externalId when options are omitted', async () => {
    const ctx = createReactorContext({
      run: {
        id: 'run_evt_root__agent__reactor',
        inputEventId: 'evt_root',
        agentName: 'agent',
        reactorName: 'reactor',
        status: 'running',
        attemptCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      event: {
        id: 'evt_root',
        type: 'example.ping.v1',
        source: 'test',
        externalId: 'root',
        data: {},
        rootId: 'evt_root',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      store: { appendEvent: vi.fn() } as never,
    });

    await expect(
      ctx.emit('example.pong.v1', {}, undefined as never),
    ).rejects.toThrow(/externalId/);
    await expect(ctx.emit('example.pong.v1', {}, {} as never)).rejects.toThrow(
      /externalId/,
    );
  });

  it('requires an external id at runtime', async () => {
    const ctx = createReactorContext({
      run: {
        id: 'run_evt_root__agent__reactor',
        inputEventId: 'evt_root',
        agentName: 'agent',
        reactorName: 'reactor',
        status: 'running',
        attemptCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      event: {
        id: 'evt_root',
        type: 'example.ping.v1',
        source: 'test',
        externalId: 'root',
        data: {},
        rootId: 'evt_root',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      store: { appendEvent: vi.fn() } as never,
    });

    await expect(
      ctx.emit('example.pong.v1', {}, { externalId: ' ' }),
    ).rejects.toThrow(/externalId/);
  });

  it('requireDb throws when no database was wired', () => {
    const ctx = createReactorContext({
      run: {
        id: 'run-1',
        inputEventId: 'evt-1',
        agentName: 'agent',
        reactorName: 'reactor',
        status: 'running',
        attemptCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      event: {
        id: 'evt-1',
        type: 'example.ping.v1',
        source: 'test',
        externalId: 'root',
        data: {},
        rootId: 'evt-1',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      store: { appendEvent: vi.fn() } as never,
    });
    expect(() => ctx.requireDb()).toThrow(/no SQLite database/);
  });
});
