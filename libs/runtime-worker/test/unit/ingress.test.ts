import { runWithRuntimeSpan } from 'runtime-observability';
import { appendEvent } from 'runtime-store';
import { describe, expect, it, vi } from 'vitest';
import { createIngressContext, defineIngress } from '../../src/ingress';

vi.mock('runtime-store', () => ({
  appendEvent: vi.fn(async (_store, input) => ({
    id: 'evt_ingress',
    createdAt: '2026-01-01T00:00:00.000Z',
    rootId: input.rootId ?? 'evt_ingress',
    ...input,
  })),
}));

vi.mock('runtime-observability', () => ({
  runWithRuntimeSpan: vi.fn(async (input) => input.run()),
  eventTraceCarrier: vi.fn(() => ({})),
}));

describe('defineIngress', () => {
  it('returns ingress definitions unchanged', () => {
    const ingress = vi.fn();
    expect(defineIngress(ingress)).toBe(ingress);
  });
});

describe('createIngressContext', () => {
  it('emits events with default source and wired dependencies', async () => {
    const adapters = { github: { name: 'fake' } };
    const agents = { reviewer: { name: 'agent-reviewer' } };
    const store = { query: vi.fn() } as never;
    const ctx = createIngressContext({
      agent: 'agent-reviewer',
      source: 'synapse://test/ingress',
      store,
      adapters,
      agents,
    });

    const event = await ctx.emit(
      'example.ping.v1',
      { message: 'hello' },
      {
        externalId: 'external-1',
        subject: 'subject-1',
        rootId: 'evt_root',
        parentId: 'evt_parent',
      },
    );

    expect(ctx.agent).toBe('agent-reviewer');
    expect(ctx.store.pool).toBe(store);
    expect(ctx.adapters).toBe(adapters);
    expect(ctx.agents).toBe(agents);
    expect(appendEvent).toHaveBeenCalledWith(store, {
      type: 'example.ping.v1',
      data: { message: 'hello' },
      source: 'synapse://test/ingress',
      externalId: 'external-1',
      subject: 'subject-1',
      rootId: 'evt_root',
      parentId: 'evt_parent',
    });
    expect(event.id).toBe('evt_ingress');
  });

  it('allows emit callers to override source', async () => {
    const store = { query: vi.fn() } as never;
    const ctx = createIngressContext({
      agent: 'agent-reviewer',
      source: 'synapse://test/ingress',
      store,
    });

    await ctx.emit(
      'example.ping.v1',
      { message: 'hello' },
      {
        externalId: 'external-2',
        source: 'synapse://override',
      },
    );

    expect(appendEvent).toHaveBeenLastCalledWith(
      store,
      expect.objectContaining({ source: 'synapse://override' }),
    );
  });

  it('wraps emit in an ingress span when a tracer is provided', async () => {
    const tracer = { startActiveSpan: vi.fn() } as never;
    const store = { query: vi.fn() } as never;
    const ctx = createIngressContext({
      agent: 'agent-reviewer',
      source: 'synapse://test/ingress',
      store,
      tracer,
    });

    await ctx.emit(
      'example.ping.v1',
      { message: 'hello' },
      { externalId: 'external-3' },
    );

    expect(runWithRuntimeSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        hop: 'ingress.emit',
        tracer,
        eventType: 'example.ping.v1',
        source: 'synapse://test/ingress',
      }),
    );
  });

  it('rejects blank agent and source names', () => {
    expect(() =>
      createIngressContext({
        agent: ' ',
        source: 'synapse://test/ingress',
        store: {} as never,
      }),
    ).toThrow('Ingress agent must be non-empty');
    expect(() =>
      createIngressContext({
        agent: 'agent-reviewer',
        source: ' ',
        store: {} as never,
      }),
    ).toThrow('Ingress source must be non-empty');
  });

  it('propagates append failures from validation or storage', async () => {
    vi.mocked(appendEvent).mockRejectedValueOnce(
      new Error('validation failed'),
    );
    const ctx = createIngressContext({
      agent: 'agent-reviewer',
      source: 'synapse://test/ingress',
      store: {} as never,
    });

    await expect(
      ctx.emit(
        'example.ping.v1',
        { message: 'hello' },
        { externalId: 'external-4' },
      ),
    ).rejects.toThrow('validation failed');
  });
});
