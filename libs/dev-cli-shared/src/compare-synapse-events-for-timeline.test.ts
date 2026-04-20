import { describe, expect, it } from 'vitest';

import { compareSynapseEventsForTimeline } from './compare-synapse-events-for-timeline.js';

describe('compareSynapseEventsForTimeline', () => {
  it('orders by timeline_order when createdAt ties', () => {
    const started = {
      id: 'evt_z_completed_first_by_id',
      type: 'pi.tool-call.started.v1',
      createdAt: '2026-05-19T15:05:53.000Z',
      data: {
        tool_call_id: 'tc-a',
        timeline_order: 1,
      },
    };
    const completed = {
      id: 'evt_a_starts_first_by_id',
      type: 'pi.tool-call.completed.v1',
      createdAt: '2026-05-19T15:05:53.000Z',
      data: {
        tool_call_id: 'tc-a',
        timeline_order: 0,
      },
    };
    expect(compareSynapseEventsForTimeline(completed, started)).toBeLessThan(0);
    expect(compareSynapseEventsForTimeline(started, completed)).toBeGreaterThan(
      0,
    );
  });

  it('puts started before completed for same tool_call_id without timeline_order', () => {
    const started = {
      id: 'evt_b',
      type: 'pi.tool-call.started.v1',
      createdAt: '2026-05-19T15:05:53.000Z',
      data: { tool_call_id: 'tc-legacy' },
    };
    const completed = {
      id: 'evt_a',
      type: 'pi.tool-call.completed.v1',
      createdAt: '2026-05-19T15:05:53.000Z',
      data: { tool_call_id: 'tc-legacy' },
    };
    expect(compareSynapseEventsForTimeline(started, completed)).toBeLessThan(0);
  });

  it('falls back to id when no timeline_order and different tool_call_id', () => {
    const left = {
      id: 'evt_aaa',
      type: 'pi.tool-call.started.v1',
      createdAt: '2026-05-19T15:05:53.000Z',
      data: { tool_call_id: 'tc-1' },
    };
    const right = {
      id: 'evt_bbb',
      type: 'pi.tool-call.started.v1',
      createdAt: '2026-05-19T15:05:53.000Z',
      data: { tool_call_id: 'tc-2' },
    };
    expect(compareSynapseEventsForTimeline(left, right)).toBeLessThan(0);
  });
});
