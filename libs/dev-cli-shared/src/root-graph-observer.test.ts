import type { RuntimePool } from 'runtime-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryEvents, selectAgentRunsForEventIds } = vi.hoisted(() => ({
  queryEvents: vi.fn(),
  selectAgentRunsForEventIds: vi.fn(),
}));

vi.mock('runtime-store', async (importOriginal) => {
  const mod = await importOriginal<typeof import('runtime-store')>();
  return {
    ...mod,
    queryEvents,
  };
});

vi.mock('./gather-run-record.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./gather-run-record.js')>();
  return {
    ...mod,
    selectAgentRunsForEventIds,
  };
});

import { createRootGraphObserver } from './root-graph-observer.js';

describe('createRootGraphObserver', () => {
  const pool = {} as RuntimePool;

  beforeEach(() => {
    queryEvents.mockReset();
    selectAgentRunsForEventIds.mockReset();
  });

  it('returns new lines on each poll without duplicates', async () => {
    queryEvents
      .mockResolvedValueOnce([
        {
          id: 'evt_a',
          type: 'pr.received.v1',
          source: 's',
          externalId: 'e',
          rootId: 'evt_a',
          createdAt: '2026-01-01T00:00:00.000Z',
          data: {},
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'evt_a',
          type: 'pr.received.v1',
          source: 's',
          externalId: 'e',
          rootId: 'evt_a',
          createdAt: '2026-01-01T00:00:00.000Z',
          data: {},
        },
        {
          id: 'evt_b',
          type: 'pi.tool-call.started.v1',
          source: 's',
          externalId: 'e2',
          rootId: 'evt_a',
          parentId: 'evt_a',
          createdAt: '2026-01-01T00:00:01.000Z',
          data: { timeline_order: 0 },
        },
      ])
      .mockResolvedValue([]);
    selectAgentRunsForEventIds
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'run_1',
          inputEventId: 'evt_a',
          agentName: 'agent-reviewer',
          reactorName: 'review-pr',
          status: 'running',
          createdAt: '2026-01-01T00:00:00.500Z',
          updatedAt: '2026-01-01T00:00:00.500Z',
        },
      ])
      .mockResolvedValue([
        {
          id: 'run_1',
          inputEventId: 'evt_a',
          agentName: 'agent-reviewer',
          reactorName: 'review-pr',
          status: 'running',
          createdAt: '2026-01-01T00:00:00.500Z',
          updatedAt: '2026-01-01T00:00:00.500Z',
        },
      ]);

    const observer = createRootGraphObserver();
    const first = await observer.poll(pool, 'evt_a');
    const second = await observer.poll(pool, 'evt_a');
    const third = await observer.poll(pool, 'evt_a');

    expect(first).toHaveLength(1);
    expect(first[0]).toContain('pr.received.v1');
    expect(second).toHaveLength(2);
    expect(second.some((line) => line.includes('agent-reviewer'))).toBe(true);
    expect(second.some((line) => line.includes('pi.tool-call.started'))).toBe(
      true,
    );
    expect(third).toHaveLength(0);
  });
});
