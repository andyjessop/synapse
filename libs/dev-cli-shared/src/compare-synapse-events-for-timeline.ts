const PI_TOOL_CALL_STARTED = 'pi.tool-call.started.v1' as const;
const PI_TOOL_CALL_COMPLETED = 'pi.tool-call.completed.v1' as const;

export type SynapseEventTimelineSortable = {
  id: string;
  type: string;
  createdAt: string;
  data?: unknown;
};

function readTimelineOrder(
  event: SynapseEventTimelineSortable,
): number | undefined {
  const { data } = event;
  if (data === null || typeof data !== 'object') {
    return undefined;
  }
  const timelineOrder = (data as Record<string, unknown>).timeline_order;
  return typeof timelineOrder === 'number' ? timelineOrder : undefined;
}

function readToolCallId(
  event: SynapseEventTimelineSortable,
): string | undefined {
  const { data } = event;
  if (data === null || typeof data !== 'object') {
    return undefined;
  }
  const toolCallId = (data as Record<string, unknown>).tool_call_id;
  return typeof toolCallId === 'string' ? toolCallId : undefined;
}

function piToolCallPhase(type: string): 0 | 1 | undefined {
  if (type === PI_TOOL_CALL_STARTED) {
    return 0;
  }
  if (type === PI_TOOL_CALL_COMPLETED) {
    return 1;
  }
  return undefined;
}

/**
 * Total order for events on one root graph: `createdAt`, then recorded
 * `data.timeline_order` (Pi harness), then Pi tool-call phase for legacy rows,
 * then `id`.
 */
export function compareSynapseEventsForTimeline(
  left: SynapseEventTimelineSortable,
  right: SynapseEventTimelineSortable,
): number {
  const byTime = left.createdAt.localeCompare(right.createdAt);
  if (byTime !== 0) {
    return byTime;
  }

  const leftOrder = readTimelineOrder(left);
  const rightOrder = readTimelineOrder(right);
  if (leftOrder !== undefined && rightOrder !== undefined) {
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
  } else if (leftOrder !== undefined) {
    return -1;
  } else if (rightOrder !== undefined) {
    return 1;
  }

  const leftPhase = piToolCallPhase(left.type);
  const rightPhase = piToolCallPhase(right.type);
  if (leftPhase !== undefined && rightPhase !== undefined) {
    const leftToolCallId = readToolCallId(left);
    const rightToolCallId = readToolCallId(right);
    if (
      leftToolCallId !== undefined &&
      leftToolCallId === rightToolCallId &&
      leftPhase !== rightPhase
    ) {
      return leftPhase - rightPhase;
    }
  }

  return left.id.localeCompare(right.id);
}
