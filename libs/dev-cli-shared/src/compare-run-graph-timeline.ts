import { compareSynapseEventsForTimeline } from './compare-synapse-events-for-timeline.js';
import type {
  DevOnceRunRecordAgentRun,
  DevOnceRunRecordEvent,
} from './run-record.js';

export type RunGraphTimelineItem =
  | { kind: 'event'; event: DevOnceRunRecordEvent }
  | { kind: 'agent_run'; run: DevOnceRunRecordAgentRun };

/** Total order for flat live output (not the tree walk). */
export function compareRunGraphTimelineItems(
  left: RunGraphTimelineItem,
  right: RunGraphTimelineItem,
): number {
  const leftTime =
    left.kind === 'event' ? left.event.createdAt : left.run.createdAt;
  const rightTime =
    right.kind === 'event' ? right.event.createdAt : right.run.createdAt;
  const byTime = leftTime.localeCompare(rightTime);
  if (byTime !== 0) {
    return byTime;
  }

  if (left.kind !== right.kind) {
    return left.kind === 'event' ? -1 : 1;
  }

  if (left.kind === 'event' && right.kind === 'event') {
    return compareSynapseEventsForTimeline(left.event, right.event);
  }

  if (left.kind === 'agent_run' && right.kind === 'agent_run') {
    const byCreated = left.run.createdAt.localeCompare(right.run.createdAt);
    if (byCreated !== 0) {
      return byCreated;
    }
    return left.run.id.localeCompare(right.run.id);
  }

  return 0;
}
