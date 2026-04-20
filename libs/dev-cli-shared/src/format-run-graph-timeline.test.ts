import { describe, expect, it } from 'vitest';

import { formatRunGraphTimelineLines } from './format-run-graph-timeline.js';

describe('formatRunGraphTimelineLines', () => {
  it('maps timeline items to flat lines in order', () => {
    const lines = formatRunGraphTimelineLines([
      {
        kind: 'event',
        event: {
          id: 'evt_a',
          type: 'pr.received.v1',
          source: 's',
          externalId: 'e',
          rootId: 'evt_a',
          createdAt: '2026-01-01T00:00:00.000Z',
          data: {},
        },
      },
      {
        kind: 'agent_run',
        run: {
          id: 'run_1',
          inputEventId: 'evt_a',
          agentName: 'agent-reviewer',
          reactorName: 'review-pr',
          status: 'succeeded',
          createdAt: '2026-01-01T00:00:00.500Z',
          updatedAt: '2026-01-01T00:00:01.000Z',
        },
      },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('pr.received.v1');
    expect(lines[1]).toContain('agent-reviewer / review-pr');
    expect(lines[1]).toContain('✓');
  });
});
