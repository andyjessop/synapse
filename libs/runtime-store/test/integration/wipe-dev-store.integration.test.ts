import { randomUUID } from 'node:crypto';
import { parseRuntimeConfig } from 'runtime-config';
import { describe, expect, it } from 'vitest';
import {
  appendEvent,
  createRuntimeStorePool,
  migrateRuntimeStore,
  type RuntimePool,
  wipeDevRuntimeStore,
} from '../../src/index';

const DEFAULT_DATABASE_URL =
  process.env.RUNTIME_INTEGRATION_DATABASE_URL ??
  'postgresql://synapse:synapse@127.0.0.1:25432/synapse';

async function probePostgres(): Promise<boolean> {
  try {
    const pool = createRuntimeStorePool({
      databaseUrl: DEFAULT_DATABASE_URL,
      max: 1,
    });
    await pool.query('select 1');
    await pool.end();
    return true;
  } catch {
    return false;
  }
}

const postgresAvailable = await probePostgres();

async function withIsolatedStore(
  run: (pool: RuntimePool) => Promise<void>,
): Promise<void> {
  const { databaseUrl } = parseRuntimeConfig({
    ...process.env,
    DATABASE_URL: DEFAULT_DATABASE_URL,
  });
  const schema = `wipe_test_${randomUUID().replaceAll('-', '_')}`;
  const admin = createRuntimeStorePool({ databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = createRuntimeStorePool({ databaseUrl, max: 4, schema });
  try {
    await migrateRuntimeStore(pool);
    await run(pool);
  } finally {
    await pool.end();
    await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
  }
}

describe.skipIf(!postgresAvailable)('wipeDevRuntimeStore', () => {
  it('removes events and agent runs', async () => {
    await withIsolatedStore(async (pool) => {
      const event = await appendEvent(pool, {
        type: 'example.ping.v1',
        source: 'test/wipe',
        externalId: 'wipe-1',
        data: { message: 'ping' },
      });
      await pool.query(
        `insert into agent_runs (id, input_event_id, agent_name, reactor_name, status)
         values ($1, $2, 'example-echo', 'onPing', 'succeeded')`,
        [`run_${randomUUID()}`, event.id],
      );

      await wipeDevRuntimeStore(pool);

      const events = await pool.query('select count(*)::int as n from events');
      const runs = await pool.query(
        'select count(*)::int as n from agent_runs',
      );
      expect(events.rows[0]?.n).toBe(0);
      expect(runs.rows[0]?.n).toBe(0);
    });
  });
});
