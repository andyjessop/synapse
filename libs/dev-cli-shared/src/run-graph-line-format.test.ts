import { describe, expect, it } from 'vitest';

import {
  formatRunGraphAgentRunLine,
  formatRunGraphEventLine,
  formatRunGraphStatusGlyph,
} from './run-graph-line-format.js';

describe('formatRunGraphEventLine', () => {
  it('renders flat event line', () => {
    const line = formatRunGraphEventLine({
      id: 'evt_a',
      type: 'pr.received.v1',
      source: 's',
      externalId: 'e',
      rootId: 'evt_a',
      createdAt: '2026-01-01T00:00:00.000Z',
      data: {},
    });
    expect(line).toContain('pr.received.v1');
    expect(line).toContain('evt_a');
    expect(line).not.toContain('…');
  });

  it('prepends branch prefix for tree output', () => {
    const line = formatRunGraphEventLine(
      {
        id: 'evt_b',
        type: 'pr.reviewed.v1',
        source: 's',
        externalId: 'e',
        rootId: 'evt_a',
        parentId: 'evt_a',
        createdAt: '2026-01-01T00:00:01.000Z',
        data: {},
      },
      { branchPrefix: '├─' },
    );
    expect(line.startsWith('├─')).toBe(true);
  });
});

describe('formatRunGraphStatusGlyph', () => {
  it('renders succeeded and failed glyphs', () => {
    expect(formatRunGraphStatusGlyph('succeeded')).toContain('✓');
    expect(formatRunGraphStatusGlyph('failed')).toContain('✗');
    expect(formatRunGraphStatusGlyph('running')).toContain('running');
  });
});

describe('formatRunGraphAgentRunLine', () => {
  it('renders non-terminal status in yellow', () => {
    const line = formatRunGraphAgentRunLine({
      id: 'run_1',
      inputEventId: 'evt_a',
      agentName: 'agent-reviewer',
      reactorName: 'review-pr',
      status: 'running',
      createdAt: '2026-01-01T00:00:00.500Z',
      updatedAt: '2026-01-01T00:00:00.500Z',
    });
    expect(line).toContain('agent-reviewer / review-pr');
    expect(line).toContain('running');
  });

  it('renders succeeded status with check glyph', () => {
    const line = formatRunGraphAgentRunLine({
      id: 'run_2',
      inputEventId: 'evt_a',
      agentName: 'agent-reviewer',
      reactorName: 'review-pr',
      status: 'succeeded',
      createdAt: '2026-01-01T00:00:01.000Z',
      updatedAt: '2026-01-01T00:00:02.000Z',
    });
    expect(line).toContain('✓');
  });
});
