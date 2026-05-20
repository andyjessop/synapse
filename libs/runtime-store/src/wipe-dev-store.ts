import type { RuntimePool } from './db';

/**
 * Truncate durable runtime tables for local `npm run dev:once:clean`.
 * Does not drop schema or migration history.
 */
export async function wipeDevRuntimeStore(pool: RuntimePool): Promise<void> {
  await pool.query(
    'truncate table agent_runs, events restart identity cascade',
  );
}
