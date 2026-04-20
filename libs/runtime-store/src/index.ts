import { randomBytes } from 'node:crypto';
import { validateEventData } from 'runtime-events';
import {
  createRuntimeStorePool,
  type RuntimePool,
  withTransaction,
} from './db';
import { migrateRuntimeStore, migrateRuntimeStoreTo } from './migrations';
import type {
  AgentRun,
  AppendEventInput,
  ClaimedRun,
  EnsureAgentRunInput,
  RunFailureDetail,
  RuntimeStore,
  SynapseEvent,
} from './types';

export type {
  Queryable,
  RuntimePool,
} from './db';
export { withTransaction } from './db';
export {
  devRunSnapshotArtifactFileName,
  formatDevArtifactTimestamp,
  formatDevJsonFileBody,
} from './dev-artifact-files';
export type {
  AgentRun,
  AgentRunRecord,
  AgentRunStatus,
  AppendEventInput,
  ClaimedRun,
  EnsureAgentRunInput,
  EventRecord,
  RunFailureDetail,
  RuntimeStore,
  SynapseEvent,
} from './types';
export { createRuntimeStorePool, migrateRuntimeStore, migrateRuntimeStoreTo };

const TRANSIENT_SQLSTATES = new Set(['40001', '40P01']);
const MAX_EVENT_PAYLOAD_BYTES = 1024 * 1024;

export function createRuntimeStore(pool: RuntimePool): RuntimeStore {
  return {
    appendEvent: (input) => appendEvent(pool, input),
    loadEventsForPlanning: (limit) => loadEventsForPlanning(pool, limit),
    ensureAgentRun: (input) => ensureAgentRun(pool, input),
    loadPendingRuns: (limit) => loadPendingRuns(pool, limit),
    markRunQueued: (runId) => markRunQueued(pool, runId),
    claimRun: (runId, lockMs) => claimRun(pool, runId, lockMs),
    renewRunLock: (runId, lockMs) => renewRunLock(pool, runId, lockMs),
    markRunSucceeded: (runId) => markRunSucceeded(pool, runId),
    markRunFailed: (runId, error, failureDetail) =>
      markRunFailed(pool, runId, error, failureDetail),
    repairStaleRuns: () => repairStaleRuns(pool),
    loadEvent: (eventId) => loadEvent(pool, eventId),
  };
}

export async function appendEvent(
  pool: RuntimePool,
  input: AppendEventInput,
): Promise<SynapseEvent> {
  validateAppendInput(input);
  validateEventData(input.type, input.data);
  return retryTransient(async () =>
    withTransaction(pool, async (client) => {
      const existing = await client.query(
        `
          select *
          from events
          where source = $1 and external_id = $2
          limit 1
        `,
        [input.source, input.externalId],
      );
      if (existing.rowCount === 1) {
        const existingRow = existing.rows[0] as Record<string, unknown>;
        return mapEventsTableRowToSynapseEvent(existingRow);
      }

      const id = newEventId();
      const rootId = input.rootId ?? id;

      const inserted = await client.query(
        `
          insert into events (
            id, type, source, external_id, subject, data, root_id, parent_id
          )
          values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
          on conflict (source, external_id) do nothing
          returning *
        `,
        [
          id,
          input.type,
          input.source,
          input.externalId,
          input.subject ?? null,
          JSON.stringify(input.data),
          rootId,
          input.parentId ?? null,
        ],
      );

      if (inserted.rowCount === 0) {
        const deduped = await client.query(
          `
            select *
            from events
            where source = $1 and external_id = $2
            limit 1
          `,
          [input.source, input.externalId],
        );
        if (deduped.rowCount !== 1) {
          throw new Error(
            `Event dedupe conflicted but row was not found: ${input.source}/${input.externalId}`,
          );
        }
        return mapEventsTableRowToSynapseEvent(deduped.rows[0]);
      }

      const row = inserted.rows[0] as Record<string, unknown>;
      return {
        id: String(row.id),
        type: String(row.type),
        source: String(row.source),
        externalId: String(row.external_id),
        subject: optionalString(row.subject),
        data: input.data,
        rootId: String(row.root_id),
        parentId: optionalString(row.parent_id),
        createdAt: new Date(String(row.created_at)).toISOString(),
      };
    }),
  );
}

export async function loadEventsForPlanning(
  pool: RuntimePool,
  limit: number,
): Promise<SynapseEvent[]> {
  if (limit <= 0) {
    return [];
  }
  const result = await pool.query(
    `
      select *
      from events
      order by created_at desc
      limit $1
    `,
    [limit],
  );
  return result.rows.map((row) => mapEventsTableRowToSynapseEvent(row));
}

export async function queryEvents(
  pool: RuntimePool,
  filter: {
    limit?: number;
    types?: readonly string[];
    subjects?: readonly string[];
    rootIds?: readonly string[];
  } = {},
): Promise<SynapseEvent[]> {
  const parts: string[] = [];
  const values: unknown[] = [];
  if (filter.types !== undefined) {
    values.push(filter.types);
    parts.push(`type = any($${values.length}::text[])`);
  }
  if (filter.subjects !== undefined) {
    values.push(filter.subjects);
    parts.push(`subject = any($${values.length}::text[])`);
  }
  if (filter.rootIds !== undefined) {
    values.push(filter.rootIds);
    parts.push(`root_id = any($${values.length}::text[])`);
  }
  const limit = filter.limit ?? 100;
  values.push(limit);
  const result = await pool.query(
    `
      select *
      from events
      ${parts.length === 0 ? '' : `where ${parts.join(' and ')}`}
      order by created_at desc
      limit $${values.length}
    `,
    values,
  );
  return result.rows.map((row) => mapEventsTableRowToSynapseEvent(row));
}

export async function selectEventBySourceExternalId(
  pool: RuntimePool,
  source: string,
  externalId: string,
): Promise<SynapseEvent | undefined> {
  const result = await pool.query(
    `
      select *
      from events
      where source = $1 and external_id = $2
      limit 1
    `,
    [source, externalId],
  );
  return result.rowCount === 0
    ? undefined
    : mapEventsTableRowToSynapseEvent(result.rows[0]);
}

export async function ensureAgentRun(
  pool: RuntimePool,
  input: EnsureAgentRunInput,
): Promise<void> {
  const id = agentRunId(input);
  await pool.query(
    `
      insert into agent_runs (
        id, input_event_id, agent_name, reactor_name, status
      )
      values ($1, $2, $3, $4, 'pending')
      on conflict (input_event_id, agent_name, reactor_name) do nothing
    `,
    [id, input.inputEventId, input.agentName, input.reactorName],
  );
}

export async function loadPendingRuns(
  pool: RuntimePool,
  limit: number,
): Promise<AgentRun[]> {
  if (limit <= 0) {
    return [];
  }
  const result = await pool.query(
    `
      select *
      from agent_runs
      where status = 'pending'
      order by created_at asc
      limit $1
    `,
    [limit],
  );
  return result.rows.map(mapAgentRunRow);
}

export async function markRunQueued(
  pool: RuntimePool,
  runId: string,
): Promise<void> {
  await pool.query(
    `
      update agent_runs
      set status = 'queued',
          updated_at = now()
      where id = $1
        and status = 'pending'
    `,
    [runId],
  );
}

export async function claimRun(
  pool: RuntimePool,
  runId: string,
  lockMs: number,
): Promise<ClaimedRun | null> {
  const result = await pool.query(
    `
      update agent_runs
      set status = 'running',
          attempt_count = attempt_count + 1,
          locked_until = now() + ($2::integer * interval '1 millisecond'),
          updated_at = now()
      where id = $1
        and status in ('pending', 'queued', 'running')
        and (
          status in ('pending', 'queued')
          or locked_until is null
          or locked_until < now()
        )
      returning *
    `,
    [runId, lockMs],
  );
  return result.rowCount === 0 ? null : mapAgentRunRow(result.rows[0]);
}

export async function renewRunLock(
  pool: RuntimePool,
  runId: string,
  lockMs: number,
): Promise<boolean> {
  const result = await pool.query(
    `
      update agent_runs
      set locked_until = now() + ($2::integer * interval '1 millisecond'),
          updated_at = now()
      where id = $1
        and status = 'running'
      returning id
    `,
    [runId, lockMs],
  );
  return result.rowCount === 1;
}

export async function markRunSucceeded(
  pool: RuntimePool,
  runId: string,
): Promise<void> {
  await pool.query(
    `
      update agent_runs
      set status = 'succeeded',
          locked_until = null,
          updated_at = now()
      where id = $1
        and status = 'running'
    `,
    [runId],
  );
}

export async function markRunFailed(
  pool: RuntimePool,
  runId: string,
  error: unknown,
  failureDetail?: RunFailureDetail,
): Promise<void> {
  const detailJson =
    failureDetail === undefined ? null : JSON.stringify(failureDetail);
  await pool.query(
    `
      update agent_runs
      set status = 'failed',
          locked_until = null,
          last_error = $2,
          failure_detail = $3::jsonb,
          updated_at = now()
      where id = $1
        and status in ('queued', 'running')
    `,
    [runId, errorToString(error), detailJson],
  );
}

/**
 * Operator/dev retry: move a terminal `failed` run back to `pending` so the
 * queueing stream can enqueue a new BullMQ job. Does not touch Redis; callers
 * must clear a stale failed job with the same `jobId` when `removeOnFail` was
 * false on an older deployment.
 */
export async function requeueFailedAgentRun(
  pool: RuntimePool,
  runId: string,
): Promise<boolean> {
  const result = await pool.query(
    `
      update agent_runs
      set status = 'pending',
          last_error = null,
          locked_until = null,
          failure_detail = null,
          updated_at = now()
      where id = $1
        and status = 'failed'
      returning id
    `,
    [runId],
  );
  return result.rowCount === 1;
}

export async function repairStaleRuns(pool: RuntimePool): Promise<void> {
  await pool.query(
    `
      update agent_runs
      set status = 'pending',
          locked_until = null,
          updated_at = now()
      where status = 'queued'
        and updated_at < now() - interval '5 minutes'
    `,
  );
  await pool.query(
    `
      update agent_runs
      set status = 'pending',
          locked_until = null,
          updated_at = now()
      where status = 'running'
        and locked_until < now()
    `,
  );
}

export async function loadEvent(
  pool: RuntimePool,
  eventId: string,
): Promise<SynapseEvent> {
  const result = await pool.query(
    `
      select *
      from events
      where id = $1
      limit 1
    `,
    [eventId],
  );
  if (result.rowCount !== 1) {
    throw new Error(`Missing event: ${eventId}`);
  }
  return mapEventsTableRowToSynapseEvent(result.rows[0]);
}

export async function selectEventById(
  pool: RuntimePool,
  eventId: string,
): Promise<SynapseEvent | undefined> {
  const result = await pool.query(
    `
      select *
      from events
      where id = $1
      limit 1
    `,
    [eventId],
  );
  return result.rowCount === 0
    ? undefined
    : mapEventsTableRowToSynapseEvent(result.rows[0]);
}

export function agentRunId(input: EnsureAgentRunInput): string {
  return `run_${input.inputEventId}__${input.agentName}__${input.reactorName}`;
}

function validateAppendInput(input: AppendEventInput): void {
  validateNonEmptyBounded(input.type, 'type', 200);
  validateNonEmptyBounded(input.source, 'source', 500);
  validateNonEmptyBounded(input.externalId, 'externalId', 500);
  if (input.subject !== undefined && input.subject.length > 500) {
    throw new Error('subject must be at most 500 characters');
  }
  const serialized = JSON.stringify(input.data);
  if (serialized === undefined) {
    throw new Error('data must be JSON-serializable');
  }
  const byteLen = Buffer.byteLength(serialized, 'utf8');
  if (byteLen > MAX_EVENT_PAYLOAD_BYTES) {
    throw new Error('data must serialize to no more than 1 MiB');
  }
}

function validateNonEmptyBounded(
  value: string,
  name: string,
  max: number,
): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }
  if (value.length > max) {
    throw new Error(`${name} must be at most ${max} characters`);
  }
}

async function retryTransient<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientSqlError(error) || attempt === 2) {
        throw error;
      }
    }
  }
  throw lastError;
}

function isTransientSqlError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    TRANSIENT_SQLSTATES.has(String(error.code))
  );
}

function newEventId(): string {
  return `evt_${randomBytes(16).toString('hex')}`;
}

function mapEventsTableRowToSynapseEvent(
  row: Record<string, unknown>,
): SynapseEvent {
  return {
    id: String(row.id),
    type: String(row.type),
    source: String(row.source),
    externalId: String(row.external_id),
    subject: optionalString(row.subject),
    data: row.data as SynapseEvent['data'],
    rootId: String(row.root_id),
    parentId: optionalString(row.parent_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapAgentRunRow(row: Record<string, unknown>): AgentRun {
  return {
    id: String(row.id),
    inputEventId: String(row.input_event_id),
    agentName: String(row.agent_name),
    reactorName: String(row.reactor_name),
    agent: String(row.agent_name),
    reactor: String(row.reactor_name),
    status: row.status as AgentRun['status'],
    attemptCount: Number(row.attempt_count),
    lockedUntil: dateString(row.locked_until),
    lastError: optionalString(row.last_error),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function dateString(value: unknown): string | undefined {
  return value === null || value === undefined
    ? undefined
    : new Date(String(value)).toISOString();
}

function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
