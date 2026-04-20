import { queryEvents, type RuntimePool } from 'runtime-store';

import {
  compareRunGraphTimelineItems,
  type RunGraphTimelineItem,
} from './compare-run-graph-timeline.js';
import { DEV_RUN_GRAPH_EVENT_LIMIT } from './dev-run-graph-limit.js';
import { formatRunGraphTimelineLines } from './format-run-graph-timeline.js';
import {
  mapSynapseEventToDevOnceRunRecordEvent,
  selectAgentRunsForEventIds,
} from './gather-run-record.js';

/** @deprecated Use {@link DEV_RUN_GRAPH_EVENT_LIMIT}. */
export const ROOT_GRAPH_OBSERVER_EVENT_LIMIT = DEV_RUN_GRAPH_EVENT_LIMIT;

export type RootGraphObserver = {
  /** Query Postgres for root graph delta; return new flat lines in timeline order. */
  poll(pool: RuntimePool, rootId: string): Promise<readonly string[]>;
};

export function createRootGraphObserver(): RootGraphObserver {
  const seenEventIds = new Set<string>();
  const seenRunIds = new Set<string>();

  return {
    async poll(pool, rootId) {
      const chain = await queryEvents(pool, {
        rootIds: [rootId],
        limit: DEV_RUN_GRAPH_EVENT_LIMIT,
      });
      const events = chain.map(mapSynapseEventToDevOnceRunRecordEvent);
      const eventIds = events.map((event) => event.id);
      const agentRuns = await selectAgentRunsForEventIds(pool, eventIds);

      const newItems: RunGraphTimelineItem[] = [];
      for (const event of events) {
        if (!seenEventIds.has(event.id)) {
          seenEventIds.add(event.id);
          newItems.push({ kind: 'event', event });
        }
      }
      for (const run of agentRuns) {
        if (!seenRunIds.has(run.id)) {
          seenRunIds.add(run.id);
          newItems.push({ kind: 'agent_run', run });
        }
      }

      newItems.sort(compareRunGraphTimelineItems);

      return formatRunGraphTimelineLines(newItems);
    },
  };
}
