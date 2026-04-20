import { randomUUID } from 'node:crypto';
import { parseRuntimeConfig } from 'runtime-config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appendEvent,
  claimRun,
  createRuntimeStorePool,
  ensureAgentRun,
  loadEvent,
  markRunFailed,
  markRunSucceeded,
  migrateRuntimeStore,
  type RuntimePool,
  renewRunLock,
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
  const schema = `store_test_${randomUUID().replaceAll('-', '_')}`;
  const admin = createRuntimeStorePool({ databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = createRuntimeStorePool({ databaseUrl, max: 4, schema });
  try {
    await migrateRuntimeStore(pool);
    await run(pool);
  } finally {
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
}

describe.skipIf(!postgresAvailable)('streams runtime store', () => {
  it('concurrent_migrateRuntimeStore_calls_succeed', async () => {
    await withIsolatedStore(async (pool) => {
      await Promise.all([
        migrateRuntimeStore(pool),
        migrateRuntimeStore(pool),
        migrateRuntimeStore(pool),
      ]);
    });
  });

  it('worker_runs_migrations_on_startup', async () => {
    await withIsolatedStore(async (pool) => {
      const tables = await pool.query(
        `
          select table_name
          from information_schema.tables
          where table_schema = current_schema()
            and table_name in ('events', 'agent_runs')
        `,
      );
      expect(tables.rowCount).toBe(2);
    });
  });

  it('ingress_same_external_id_different_source_creates_two_events', async () => {
    await withIsolatedStore(async (pool) => {
      const externalId = `shared:${randomUUID()}`;
      const first = await appendEvent(pool, {
        type: 'ticket.opened.v1',
        data: ticketOpenedData('T-1'),
        source: 'synapse://a',
        externalId,
      });
      const second = await appendEvent(pool, {
        type: 'ticket.opened.v1',
        data: ticketOpenedData('T-2'),
        source: 'synapse://b',
        externalId,
      });
      expect(first.id).not.toBe(second.id);
      const count = await pool.query(`select count(*)::int as c from events`);
      expect(Number(count.rows[0].c)).toBe(2);
    });
  });

  it('db_rejects_invalid_agent_run_status', async () => {
    await withIsolatedStore(async (pool) => {
      const event = await appendEvent(pool, {
        type: 'ticket.opened.v1',
        data: ticketOpenedData('T-1'),
        source: 'synapse://test',
        externalId: `status:${randomUUID()}`,
      });
      await expect(
        pool.query(
          `
            insert into agent_runs (
              id, input_event_id, agent_name, reactor_name, status
            )
            values ($1, $2, 'example-echo', 'example-ping', 'bogus')
          `,
          [`run_${event.id}__example-echo__example-ping`, event.id],
        ),
      ).rejects.toThrow();
    });
  });

  it('db_rejects_null_event_data', async () => {
    await withIsolatedStore(async (pool) => {
      await expect(
        pool.query(
          `
            insert into events (
              id, type, source, external_id, data, root_id
            )
            values ($1, $2, $3, $4, null, $1)
          `,
          [
            `evt_${randomUUID()}`,
            'ticket.opened.v1',
            'synapse://test',
            `null-data:${randomUUID()}`,
          ],
        ),
      ).rejects.toThrow();
    });
  });

  it('terminal transitions apply only from running', async () => {
    await withIsolatedStore(async (pool) => {
      const event = await appendEvent(pool, {
        type: 'ticket.opened.v1',
        data: ticketOpenedData('T-1'),
        source: 'synapse://test',
        externalId: `terminal:${randomUUID()}`,
      });
      await ensureAgentRun(pool, {
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      const runId = `run_${event.id}__example-echo__example-ping`;
      await markRunSucceeded(pool, runId);
      const afterSuccess = await pool.query(
        `select status from agent_runs where id = $1`,
        [runId],
      );
      expect(afterSuccess.rows[0].status).toBe('pending');
      await markRunFailed(pool, runId, new Error('late failure'));
      const afterFailure = await pool.query(
        `select status from agent_runs where id = $1`,
        [runId],
      );
      expect(afterFailure.rows[0].status).toBe('pending');
    });
  });

  it('claimRun accepts pending rows (BullMQ may run before markRunQueued)', async () => {
    await withIsolatedStore(async (pool) => {
      const event = await appendEvent(pool, {
        type: 'ticket.opened.v1',
        data: ticketOpenedData('T-1'),
        source: 'synapse://test',
        externalId: `pending-claim:${randomUUID()}`,
      });
      await ensureAgentRun(pool, {
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      const runId = `run_${event.id}__example-echo__example-ping`;
      const claimed = await claimRun(pool, runId, 120_000);
      expect(claimed).not.toBeNull();
      expect(claimed?.status).toBe('running');
    });
  });

  it('renewRunLock extends locked_until for a running run', async () => {
    await withIsolatedStore(async (pool) => {
      const event = await appendEvent(pool, {
        type: 'ticket.opened.v1',
        data: ticketOpenedData('T-renew'),
        source: 'synapse://test',
        externalId: `renew:${randomUUID()}`,
      });
      await ensureAgentRun(pool, {
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      const runId = `run_${event.id}__example-echo__example-ping`;
      const claimed = await claimRun(pool, runId, 2_000);
      expect(claimed).not.toBeNull();
      const before = await pool.query(
        `select locked_until from agent_runs where id = $1`,
        [runId],
      );
      expect(await renewRunLock(pool, runId, 120_000)).toBe(true);
      const after = await pool.query(
        `select locked_until from agent_runs where id = $1`,
        [runId],
      );
      expect(
        new Date(String(after.rows[0].locked_until)).getTime(),
      ).toBeGreaterThan(
        new Date(String(before.rows[0].locked_until)).getTime(),
      );
      expect(await renewRunLock(pool, runId, 120_000)).toBe(true);
      await markRunSucceeded(pool, runId);
      expect(await renewRunLock(pool, runId, 120_000)).toBe(false);
    });
  });

  it('claimRun is idempotent for duplicate delivery', async () => {
    await withIsolatedStore(async (pool) => {
      const event = await appendEvent(pool, {
        type: 'ticket.opened.v1',
        data: ticketOpenedData('T-1'),
        source: 'synapse://test',
        externalId: `claim:${randomUUID()}`,
      });
      await ensureAgentRun(pool, {
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      const runId = `run_${event.id}__example-echo__example-ping`;
      await pool.query(
        `update agent_runs set status = 'queued' where id = $1`,
        [runId],
      );
      const first = await claimRun(pool, runId, 120_000);
      expect(first).not.toBeNull();
      await markRunSucceeded(pool, runId);
      const second = await claimRun(pool, runId, 120_000);
      expect(second).toBeNull();
    });
  });

  it('stores event data inline in Postgres', async () => {
    await withIsolatedStore(async (pool) => {
      const payload = ticketOpenedData('T-inline');
      const ev = await appendEvent(pool, {
        type: 'ticket.opened.v1',
        data: payload,
        source: 'synapse://test',
        externalId: `inline:${randomUUID()}`,
      });
      const row = await pool.query(`select data from events where id = $1`, [
        ev.id,
      ]);
      expect(row.rows[0].data).toEqual(payload);
      expect((await loadEvent(pool, ev.id)).data).toEqual(payload);
    });
  });
});

function ticketOpenedData(ticketId: string): {
  ticket_id: string;
  title: string;
  body: string;
} {
  return {
    ticket_id: ticketId,
    title: `Ticket ${ticketId}`,
    body: 'Body',
  };
}
