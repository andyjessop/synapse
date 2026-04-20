import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  appendEvent,
  createRuntimeStorePool,
  migrateRuntimeStore,
  type RuntimePool,
} from 'runtime-store';
import { afterEach, describe, expect, it } from 'vitest';

function dockerCliAvailable(): boolean {
  try {
    execFileSync('docker', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitPgReadyInContainer(container: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      execFileSync(
        'docker',
        ['exec', container, 'pg_isready', '-U', 'synapse'],
        { stdio: 'ignore' },
      );
      return;
    } catch {
      await delay(400);
    }
  }
  throw new Error(`Postgres in ${container} did not become ready`);
}

async function waitHostPostgresAcceptsConnections(
  databaseUrl: string,
  options?: { timeoutMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const probe = createRuntimeStorePool({ databaseUrl, max: 1 });
    try {
      await probe.query('select 1');
      await probe.end();
      return;
    } catch {
      await probe.end().catch(() => {});
      await delay(300);
    }
  }
  throw new Error('Postgres did not accept connections from the host in time');
}

function resolveHostPort(containerName: string): string {
  const port = execFileSync('docker', ['port', containerName, '5432'], {
    encoding: 'utf8',
  })
    .trim()
    .split(':')
    .pop();
  if (port === undefined || port === '') {
    throw new Error('could not resolve host port for postgres container');
  }
  return port;
}

function databaseUrlForContainer(containerName: string): string {
  const port = resolveHostPort(containerName);
  return `postgresql://synapse:synapse@127.0.0.1:${port}/synapse`;
}

function startDedicatedPostgres(containerName: string): void {
  execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--name',
      containerName,
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
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
}

describe.skipIf(!dockerCliAvailable())(
  'Postgres container stop/start persistence',
  () => {
    const containerName = `syn-streams-pg-restart-${randomUUID().slice(0, 12)}`;

    afterEach(() => {
      try {
        execFileSync('docker', ['rm', '-f', containerName], {
          stdio: 'ignore',
        });
      } catch {
        /* container may already be gone */
      }
    });

    it('keeps migrated schema and appended events after docker stop then start', async () => {
      startDedicatedPostgres(containerName);
      await waitPgReadyInContainer(containerName);
      let databaseUrl = databaseUrlForContainer(containerName);
      await waitHostPostgresAcceptsConnections(databaseUrl);

      let pool: RuntimePool | undefined = createRuntimeStorePool({
        databaseUrl,
        max: 4,
      });
      try {
        await migrateRuntimeStore(pool);
        const externalId = `pg-restart-proof:${randomUUID()}`;
        const inserted = await appendEvent(pool, {
          type: 'example.ping.v1',
          data: { message: 'postgres-restart', marker: randomUUID() },
          source: 'synapse://chaos/postgres-restart',
          externalId,
        });

        const before = await pool.query(
          `select count(*)::int as c from events where id = $1`,
          [inserted.id],
        );
        expect(Number(before.rows[0]?.c)).toBe(1);

        await pool.end();
        pool = undefined;

        execFileSync('docker', ['stop', '-t', '5', containerName], {
          stdio: 'ignore',
        });

        execFileSync('docker', ['start', containerName], { stdio: 'ignore' });
        await waitPgReadyInContainer(containerName);
        databaseUrl = databaseUrlForContainer(containerName);
        await waitHostPostgresAcceptsConnections(databaseUrl, {
          timeoutMs: 120_000,
        });

        pool = createRuntimeStorePool({ databaseUrl, max: 4 });
        await migrateRuntimeStore(pool);

        const after = await pool.query(
          `select count(*)::int as c from events where id = $1`,
          [inserted.id],
        );
        expect(Number(after.rows[0]?.c)).toBe(1);

        const roundTrip = await pool.query(
          `select type, source, external_id from events where id = $1`,
          [inserted.id],
        );
        expect(roundTrip.rowCount).toBe(1);
        expect(String(roundTrip.rows[0]?.type)).toBe('example.ping.v1');
        expect(String(roundTrip.rows[0]?.source)).toBe(
          'synapse://chaos/postgres-restart',
        );
        expect(String(roundTrip.rows[0]?.external_id)).toBe(externalId);
      } finally {
        await pool?.end().catch(() => {});
      }
    }, 240_000);
  },
);
