import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { parseRuntimeConfig } from 'runtime-config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createRuntimeStorePool,
  migrateRuntimeStore,
  type RuntimePool,
} from '../../src/index';

const dockerContainerName = `runtime-store-schema-${randomUUID()}`;
let testDatabaseUrl: string | undefined;

/** Tables created by the versioned ledger migrations (see `drizzle/ledger/`). */
const EXPECTED_TABLES = [
  'agent_runs',
  'events',
  'runtime_store_migrations',
] as const;

beforeAll(async () => {
  testDatabaseUrl =
    process.env.RUNTIME_STORE_TEST_DATABASE_URL ??
    (await startEphemeralPostgres());
}, 60_000);

afterAll(() => {
  if (process.env.RUNTIME_STORE_TEST_DATABASE_URL === undefined) {
    execFileSync('docker', ['rm', '-f', dockerContainerName], {
      stdio: 'ignore',
    });
  }
});

async function withFreshStore(
  run: (pool: RuntimePool) => Promise<void>,
): Promise<void> {
  const { databaseUrl } = parseRuntimeConfig({
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
  });
  const schema = `runtime_store_schema_${randomUUID().replaceAll('-', '_')}`;
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

async function startEphemeralPostgres(): Promise<string> {
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '-d',
      '--name',
      dockerContainerName,
      '-e',
      'POSTGRES_USER=synapse',
      '-e',
      'POSTGRES_PASSWORD=synapse',
      '-e',
      'POSTGRES_DB=synapse',
      '-p',
      '127.0.0.1::5432',
      'postgres:16',
    ],
    { stdio: 'ignore' },
  );
  const portOutput = execFileSync(
    'docker',
    ['port', dockerContainerName, '5432/tcp'],
    { encoding: 'utf8' },
  ).trim();
  const port = portOutput.split(':').at(-1);
  if (port === undefined || port === '') {
    throw new Error(`Could not resolve Postgres port from: ${portOutput}`);
  }
  const databaseUrl = `postgresql://synapse:synapse@127.0.0.1:${port}/synapse`;
  await waitForPostgres(databaseUrl);
  return databaseUrl;
}

async function waitForPostgres(databaseUrl: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const pool = createRuntimeStorePool({ databaseUrl, max: 1 });
    try {
      await pool.query('select 1');
      await pool.end();
      return;
    } catch (error) {
      lastError = error;
      await pool.end();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

describe('runtime-store schema vs Postgres catalog', () => {
  it('creates expected tables, PKs, FKs, and indexes for the active runtime ledger', async () => {
    await withFreshStore(async (pool) => {
      const tables = await pool.query(
        `select tablename from pg_tables
         where schemaname = current_schema() order by tablename`,
      );
      expect(tables.rows.map((r) => r.tablename)).toEqual([...EXPECTED_TABLES]);

      for (const t of EXPECTED_TABLES) {
        const pk = await pool.query(
          `select c.conname
           from pg_constraint c
           join pg_class rel on rel.oid = c.conrelid
           join pg_namespace n on n.oid = rel.relnamespace
           where n.nspname = current_schema() and rel.relname = $1
             and c.contype = 'p'`,
          [t],
        );
        expect(pk.rowCount ?? 0).toBeGreaterThanOrEqual(1);
      }

      const agentRunsCheck = await pool.query(
        `select 1 from pg_constraint c
         where c.connamespace = (select oid from pg_namespace where nspname = current_schema())
           and c.conname = 'agent_runs_status_check' and c.contype = 'c'`,
      );
      expect(agentRunsCheck.rowCount).toBe(1);

      const eventsUnique = await pool.query(
        `select c.conname
         from pg_constraint c
         join pg_class rel on rel.oid = c.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
         where n.nspname = current_schema() and rel.relname = 'events'
           and c.contype = 'u'`,
      );
      expect(
        eventsUnique.rows.some((r) =>
          String(r.conname).includes('source_external'),
        ),
      ).toBe(true);

      const obsoleteTables = await pool.query(
        `
          select tablename
          from pg_tables
          where schemaname = current_schema()
            and tablename in (
              'event_outbox',
              'runtime_capture_payloads',
              'runtime_capture_records',
              'ingress_cursors',
              'projection_recent_activity',
              'projection_subject_timeline',
              'projection_agent_health',
              'mcp_tool_invocations'
            )
        `,
      );
      expect(obsoleteTables.rows).toEqual([]);
    });
  });
});
