import type { SynapseEvent } from 'runtime-agent';
import { queryEvents, type RuntimePool } from 'runtime-store';

import { compareSynapseEventsForTimeline } from './compare-synapse-events-for-timeline.js';
import { DEV_RUN_GRAPH_EVENT_LIMIT } from './dev-run-graph-limit.js';
import {
  type DevOnceRunRecord,
  type DevOnceRunRecordAgentRun,
  type DevOnceRunRecordEvent,
  devOnceRunRecordSchema,
} from './run-record.js';

export async function selectAgentRunsForEventIds(
  pool: RuntimePool,
  eventIds: readonly string[],
): Promise<DevOnceRunRecordAgentRun[]> {
  if (eventIds.length === 0) {
    return [];
  }
  const result = await pool.query(
    `
      select
        id,
        input_event_id,
        agent_name,
        reactor_name,
        status,
        created_at,
        updated_at,
        last_error
      from agent_runs
      where input_event_id = any($1::text[])
      order by created_at asc, id asc
    `,
    [eventIds],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    inputEventId: String(row.input_event_id),
    agentName: String(row.agent_name),
    reactorName: String(row.reactor_name),
    status: String(row.status),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    lastError:
      row.last_error === null || row.last_error === undefined
        ? undefined
        : String(row.last_error),
  }));
}

export function mapSynapseEventToDevOnceRunRecordEvent(
  event: SynapseEvent,
): DevOnceRunRecordEvent {
  return {
    id: event.id,
    type: event.type,
    source: event.source,
    externalId: event.externalId,
    subject: event.subject,
    rootId: event.rootId,
    parentId: event.parentId,
    createdAt: event.createdAt,
    data: event.data,
  };
}

export async function gatherDevOnceRunRecord(
  pool: RuntimePool,
  scenarioId: string,
  inputEvent: SynapseEvent,
  recordedAt: Date = new Date(),
): Promise<DevOnceRunRecord> {
  const chain = await queryEvents(pool, {
    rootIds: [inputEvent.rootId],
    limit: DEV_RUN_GRAPH_EVENT_LIMIT,
  });
  const events = [...chain]
    .map(mapSynapseEventToDevOnceRunRecordEvent)
    .sort(compareSynapseEventsForTimeline);
  const eventIds = events.map((event) => event.id);
  const agentRuns = await selectAgentRunsForEventIds(pool, eventIds);

  return devOnceRunRecordSchema.parse({
    version: 1,
    recordedAt: recordedAt.toISOString(),
    scenarioId,
    inputEventId: inputEvent.id,
    rootId: inputEvent.rootId,
    events,
    agentRuns,
  });
}
