import { queryEvents, type RuntimePool } from 'runtime-store';

import { resolveRootGraphWaitPollParams } from './resolve-root-graph-wait.js';

export type RootGraphWaitOutcome = 'completed' | 'failed' | 'running';

export async function selectFailedRunOnRoot(
  pool: RuntimePool,
  rootId: string,
): Promise<{ id: string; lastError?: string } | undefined> {
  const result = await pool.query(
    `
      select ar.id, ar.last_error
      from agent_runs ar
      inner join events e on e.id = ar.input_event_id
      where e.root_id = $1
        and ar.status = 'failed'
      order by ar.updated_at desc
      limit 1
    `,
    [rootId],
  );
  if (result.rowCount === 0) {
    return undefined;
  }
  const row = result.rows[0];
  return {
    id: String(row.id),
    lastError:
      row.last_error === null || row.last_error === undefined
        ? undefined
        : String(row.last_error),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls until any `terminalEventTypes` event exists for `rootId`, an agent run
 * under that root has `failed`, or `maxPolls` elapses (`running`).
 */
export async function waitForRootGraphOutcome(input: {
  pool: RuntimePool;
  rootId: string;
  terminalEventTypes: readonly string[];
  maxPolls?: number;
  pollMs?: number;
  env?: Record<string, string | undefined>;
  /** Invoked at the start of every poll iteration (including the first) before terminal checks. */
  onPollTick?: () => void | Promise<void>;
}): Promise<RootGraphWaitOutcome> {
  const terminals = input.terminalEventTypes;
  if (terminals.length === 0) {
    return 'running';
  }

  const defaults = resolveRootGraphWaitPollParams(input.env);
  const maxPolls = input.maxPolls ?? defaults.maxPolls;
  const pollMs = input.pollMs ?? defaults.pollMs;

  for (let i = 0; ; i += 1) {
    if (maxPolls !== undefined && i >= maxPolls) {
      break;
    }
    if (input.onPollTick !== undefined) {
      await input.onPollTick();
    }
    const failed = await selectFailedRunOnRoot(input.pool, input.rootId);
    if (failed !== undefined) {
      return 'failed';
    }

    const outcomes = await queryEvents(input.pool, {
      rootIds: [input.rootId],
      types: [...terminals],
      limit: 10,
    });
    if (outcomes.length > 0) {
      return 'completed';
    }

    await delay(pollMs);
  }

  return 'running';
}
