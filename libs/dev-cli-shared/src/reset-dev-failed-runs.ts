import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { RuntimePool } from 'runtime-store';
import { requeueFailedAgentRun } from 'runtime-store';
import { REACTOR_QUEUE_NAME } from 'runtime-worker';

/**
 * Local dev: deduped ingress keeps the same `input_event_id`, so a terminal
 * `failed` run must be explicitly requeued. Resets Postgres and clears any
 * legacy failed BullMQ job with the same id.
 */
export async function resetFailedAgentRunsForRoot(
  pool: RuntimePool,
  rootId: string,
): Promise<readonly string[]> {
  const result = await pool.query(
    `
      select ar.id
      from agent_runs ar
      inner join events e on e.id = ar.input_event_id
      where e.root_id = $1
        and ar.status = 'failed'
    `,
    [rootId],
  );
  const runIds = result.rows.map((row) => String(row.id));
  const requeued: string[] = [];
  for (const runId of runIds) {
    if (await requeueFailedAgentRun(pool, runId)) {
      requeued.push(runId);
    }
  }
  return requeued;
}

export async function removeReactorQueueJobs(
  redisUrl: string,
  jobIds: readonly string[],
): Promise<void> {
  if (jobIds.length === 0) {
    return;
  }
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(REACTOR_QUEUE_NAME, { connection });
  try {
    for (const jobId of jobIds) {
      const job = await queue.getJob(jobId);
      if (job !== undefined) {
        await job.remove();
      }
    }
  } finally {
    await queue.close();
    await connection.quit();
  }
}

export async function retryDevFailedRunsOnRoot(input: {
  pool: RuntimePool;
  redisUrl: string;
  rootId: string;
}): Promise<readonly string[]> {
  const runIds = await resetFailedAgentRunsForRoot(input.pool, input.rootId);
  await removeReactorQueueJobs(input.redisUrl, runIds);
  return runIds;
}
