import { describe, expect, it, vi } from 'vitest';

import { createSynapsePiDevExtensionFactory } from '../../src/extensions/synapse-pi-dev-extension.js';

describe('createSynapsePiDevExtensionFactory', () => {
  it('emits started and completed synapse events on tool execution', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    const handlers = new Map<string, (event: unknown) => Promise<void>>();
    const pi = {
      on: (event: string, handler: (event: unknown) => Promise<void>) => {
        handlers.set(event, handler);
      },
    };

    createSynapsePiDevExtensionFactory({
      emit,
      inputEventId: 'evt-in',
      reviewSubject: 'gitlab:synapse/synapse!42',
      repoRoot: '/repo',
    })(pi as never);

    await handlers.get('tool_execution_start')?.({
      type: 'tool_execution_start',
      toolCallId: 'tc-1',
      toolName: 'grep',
      args: { pattern: 'foo', path: 'src' },
    });
    await handlers.get('tool_execution_end')?.({
      type: 'tool_execution_end',
      toolCallId: 'tc-1',
      toolName: 'grep',
      result: {},
      isError: false,
    });

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(
      1,
      'pi.tool-call.started.v1',
      expect.objectContaining({
        tool_call_id: 'tc-1',
        tool_name: 'grep',
        input_event_id: 'evt-in',
        timeline_order: 0,
      }),
      'pi:tool:tc-1:started',
    );
    expect(emit).toHaveBeenNthCalledWith(
      2,
      'pi.tool-call.completed.v1',
      expect.objectContaining({
        tool_call_id: 'tc-1',
        is_error: false,
        timeline_order: 1,
      }),
      'pi:tool:tc-1:completed',
    );
  });
});
