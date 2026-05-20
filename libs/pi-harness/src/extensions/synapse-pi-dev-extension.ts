import type { ExtensionFactory } from '@earendil-works/pi-coding-agent';

import type { PiHarnessSynapseEmit } from '../pi-harness-synapse-events.js';
import { formatPiToolResultSummary } from '../pi-harness-tool-result.js';
import { sanitizePiToolArgsForEvent } from './sanitize-tool-args.js';

export type CreateSynapsePiDevExtensionInput = {
  emit: PiHarnessSynapseEmit;
  inputEventId: string;
  reviewSubject: string;
  repoRoot?: string;
};

export const SYNAPSE_PI_DEV_EXTENSION_PATH =
  'synapse://pi-harness/extensions/synapse-pi-dev' as const;

/**
 * Pi.dev extension: forwards Pi tool execution lifecycle to Synapse durable events.
 *
 * Loaded in-process via `DefaultResourceLoader.extensionFactories` for SDK reviews, or
 * from `.pi/extensions/` when using the interactive Pi CLI (see `synapse-pi-dev-entry.ts`).
 */
export function createSynapsePiDevExtensionFactory(
  input: CreateSynapsePiDevExtensionInput,
): ExtensionFactory {
  return (pi) => {
    let timelineOrder = 0;
    const argsByToolCallId = new Map<string, unknown>();

    pi.on('tool_execution_start', async (event) => {
      argsByToolCallId.set(event.toolCallId, event.args);
      const order = timelineOrder;
      timelineOrder += 1;
      await input.emit(
        'pi.tool-call.started.v1',
        {
          tool_call_id: event.toolCallId,
          tool_name: event.toolName,
          args: sanitizePiToolArgsForEvent(
            event.toolName,
            event.args,
            input.repoRoot,
          ),
          input_event_id: input.inputEventId,
          review_subject: input.reviewSubject,
          timeline_order: order,
        },
        `pi:tool:${event.toolCallId}:started`,
      );
    });

    pi.on('tool_execution_end', async (event) => {
      const order = timelineOrder;
      timelineOrder += 1;
      const rawArgs = argsByToolCallId.get(event.toolCallId);
      argsByToolCallId.delete(event.toolCallId);
      const resultSummary = formatPiToolResultSummary(
        event.toolName,
        event.result,
        event.isError,
      );
      await input.emit(
        'pi.tool-call.completed.v1',
        {
          tool_call_id: event.toolCallId,
          tool_name: event.toolName,
          is_error: event.isError,
          args: sanitizePiToolArgsForEvent(
            event.toolName,
            rawArgs,
            input.repoRoot,
          ),
          ...(resultSummary !== undefined
            ? { result_summary: resultSummary }
            : {}),
          input_event_id: input.inputEventId,
          review_subject: input.reviewSubject,
          timeline_order: order,
        },
        `pi:tool:${event.toolCallId}:completed`,
      );
    });
  };
}
