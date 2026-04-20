import { describe, expect, it } from 'vitest';

import { compareRunGraphTimelineItems } from './compare-run-graph-timeline.js';

describe('compareRunGraphTimelineItems', () => {
  it('orders event before agent_run at the same createdAt', () => {
    const at = '2026-01-01T00:00:00.000Z';
    const event = {
      kind: 'event' as const,
      event: {
        id: 'evt_a',
        type: 'pr.received.v1',
        source: 's',
        externalId: 'e',
        rootId: 'evt_a',
        createdAt: at,
        data: {},
      },
    };
    const run = {
      kind: 'agent_run' as const,
      run: {
        id: 'run_1',
        inputEventId: 'evt_a',
        agentName: 'agent-reviewer',
        reactorName: 'review-pr',
        status: 'running',
        createdAt: at,
        updatedAt: at,
      },
    };
    expect(compareRunGraphTimelineItems(event, run)).toBeLessThan(0);
    expect(compareRunGraphTimelineItems(run, event)).toBeGreaterThan(0);
  });

  it('uses timeline_order for events at the same createdAt', () => {
    const at = '2026-01-01T00:00:01.000Z';
    const started = {
      kind: 'event' as const,
      event: {
        id: 'evt_started',
        type: 'pi.tool-call.started.v1',
        source: 's',
        externalId: 'e1',
        rootId: 'root',
        createdAt: at,
        data: { timeline_order: 0 },
      },
    };
    const completed = {
      kind: 'event' as const,
      event: {
        id: 'evt_completed',
        type: 'pi.tool-call.completed.v1',
        source: 's',
        externalId: 'e2',
        rootId: 'root',
        createdAt: at,
        data: { timeline_order: 1 },
      },
    };
    expect(compareRunGraphTimelineItems(started, completed)).toBeLessThan(0);
  });
});
