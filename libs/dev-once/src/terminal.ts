import type { RuntimePool } from 'runtime-store';
import type { SynapseFixture } from 'synapse-fixtures';

import type { SynapseRunArtifact } from './artifact-schema.js';

export type TerminalWaitResult =
  | { kind: 'succeeded' }
  | { kind: 'failed'; reason: string }
  | { kind: 'timed_out' };

async function hasPendingRunsOnRoot(
  pool: RuntimePool,
  rootId: string,
): Promise<boolean> {
  const result = await pool.query(
    `
      select 1
      from agent_runs ar
      inner join events e on e.id = ar.input_event_id
      where e.root_id = $1
        and ar.status in ('pending', 'running')
      limit 1
    `,
    [rootId],
  );
  return (result.rowCount ?? 0) > 0;
}

async function countAgentRunsOnRoot(
  pool: RuntimePool,
  rootId: string,
): Promise<number> {
  const result = await pool.query(
    `
      select count(*)::text as count
      from agent_runs ar
      inner join events e on e.id = ar.input_event_id
      where e.root_id = $1
    `,
    [rootId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function hasFailedRunOnRoot(
  pool: RuntimePool,
  rootId: string,
): Promise<boolean> {
  const result = await pool.query(
    `
      select 1
      from agent_runs ar
      inner join events e on e.id = ar.input_event_id
      where e.root_id = $1
        and ar.status = 'failed'
      limit 1
    `,
    [rootId],
  );
  return (result.rowCount ?? 0) > 0;
}

async function eventTypesOnRoot(
  pool: RuntimePool,
  rootId: string,
): Promise<Set<string>> {
  const result = await pool.query(
    `select distinct type from events where root_id = $1`,
    [rootId],
  );
  return new Set(result.rows.map((row) => String(row.type)));
}

export function evaluateExpectFromTypes(
  fixture: SynapseFixture,
  eventTypes: Set<string>,
  hasFailedRun: boolean,
): TerminalWaitResult {
  if (hasFailedRun) {
    return { kind: 'failed', reason: 'agent run failed' };
  }

  const expect = fixture.expect;
  if (expect === undefined) {
    return { kind: 'succeeded' };
  }

  if (
    expect.rootEventType !== undefined &&
    !eventTypes.has(expect.rootEventType)
  ) {
    return {
      kind: 'failed',
      reason: `missing root event type ${expect.rootEventType}`,
    };
  }

  if (expect.eventTypes !== undefined) {
    for (const type of expect.eventTypes) {
      if (!eventTypes.has(type)) {
        return { kind: 'failed', reason: `missing event type ${type}` };
      }
    }
  }

  if (expect.terminalEventTypes !== undefined) {
    for (const type of expect.terminalEventTypes) {
      if (!eventTypes.has(type)) {
        return {
          kind: 'failed',
          reason: `missing terminal event type ${type}`,
        };
      }
    }
  }

  return { kind: 'succeeded' };
}

export async function waitForFixtureTerminal(input: {
  pool: RuntimePool;
  rootId: string;
  fixture: SynapseFixture;
  pollMs: number;
  timeoutMs?: number;
  onPollTick?: () => void | Promise<void>;
}): Promise<TerminalWaitResult> {
  const deadline =
    input.timeoutMs === undefined ? undefined : Date.now() + input.timeoutMs;

  for (;;) {
    if (input.onPollTick !== undefined) {
      await input.onPollTick();
    }

    const pending = await hasPendingRunsOnRoot(input.pool, input.rootId);
    const failed = await hasFailedRunOnRoot(input.pool, input.rootId);
    const types = await eventTypesOnRoot(input.pool, input.rootId);
    const runCount = await countAgentRunsOnRoot(input.pool, input.rootId);

    if (
      input.fixture.expect !== undefined &&
      runCount === 0 &&
      !failed &&
      !pending
    ) {
      await new Promise((resolve) => setTimeout(resolve, input.pollMs));
      continue;
    }

    if (!pending) {
      return evaluateExpectFromTypes(input.fixture, types, failed);
    }

    if (failed) {
      return evaluateExpectFromTypes(input.fixture, types, true);
    }

    if (deadline !== undefined && Date.now() >= deadline) {
      return { kind: 'timed_out' };
    }

    await new Promise((resolve) => setTimeout(resolve, input.pollMs));
  }
}

export function terminalToArtifactStatus(
  terminal: TerminalWaitResult,
): SynapseRunArtifact['status'] {
  switch (terminal.kind) {
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'timed_out':
      return 'timed_out';
  }
}
