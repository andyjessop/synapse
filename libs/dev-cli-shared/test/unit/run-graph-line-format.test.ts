import { describe, expect, it } from 'vitest';

import { formatRunGraphEventLine } from '../../src/run-graph-line-format.js';
import type { DevOnceRunRecordEvent } from '../../src/run-record.js';

describe('formatRunGraphEventLine', () => {
  it('includes pi tool activity and result on completed events', () => {
    const event: DevOnceRunRecordEvent = {
      id: 'evt_pi',
      type: 'pi.tool-call.completed.v1',
      source: 'agent://agent-reviewer/handler',
      externalId: 'pi:tool:tc:completed',
      rootId: 'evt_root',
      parentId: 'evt_root',
      createdAt: '2026-05-21T17:30:43.000Z',
      data: {
        tool_name: 'read',
        args: { summary: 'read libs/foo.ts' },
        result_summary: 'read 120 lines',
      },
    };
    const line = formatRunGraphEventLine(event);
    expect(line).toContain('read libs/foo.ts');
    expect(line).toContain('→ read 120 lines');
    expect(line).toContain('evt_pi');
  });
});
