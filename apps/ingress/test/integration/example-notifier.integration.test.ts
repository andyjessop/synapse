import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot, parseRuntimeConfig } from 'runtime-config';
import { EXAMPLES_WEBHOOK_ROUTE_IDS } from 'runtime-manifest';
import {
  createRuntimeStorePool,
  migrateRuntimeStore,
  type RuntimePool,
  selectEventById,
} from 'runtime-store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIngressApp } from '../../src/app.js';

const dockerContainerName = `webhooks-notifier-test-${randomUUID()}`;
let testDatabaseUrl: string | undefined;

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

async function withFreshApp(
  webhookRouteIds: typeof EXAMPLES_WEBHOOK_ROUTE_IDS,
  run: (input: {
    pool: RuntimePool;
    app: ReturnType<typeof createIngressApp>['app'];
  }) => Promise<void>,
): Promise<void> {
  const { databaseUrl } = parseRuntimeConfig({
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
  });
  const schema = `webhooks_notifier_${randomUUID().replaceAll('-', '_')}`;
  const admin = createRuntimeStorePool({ databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = createRuntimeStorePool({ databaseUrl, max: 4, schema });
  try {
    await migrateRuntimeStore(pool);
    const { app } = createIngressApp({
      pool,
      webhookRouteIds,
      repoRoot: getRepoRoot(import.meta.url),
    });
    await run({ pool, app });
  } finally {
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
}

describe('POST /v1/examples/notifier/ticket', () => {
  it('accepts JSON body and stores ticket.opened.v1', async () => {
    await withFreshApp(EXAMPLES_WEBHOOK_ROUTE_IDS, async ({ pool, app }) => {
      const fixturePath = join(
        getRepoRoot(import.meta.url),
        'examples/fixtures/agent-notifier/ticket-opened.json',
      );
      const fixture = readFileSync(fixturePath, 'utf8');
      const response = await app.request('/v1/examples/notifier/ticket', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: fixture,
      });
      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        event_id: string;
        type: string;
      };
      expect(body.type).toBe('ticket.opened.v1');

      const stored = await selectEventById(pool, body.event_id);
      expect(stored?.type).toBe('ticket.opened.v1');
    });
  });

  it('accepts echo ping on the echo route', async () => {
    await withFreshApp(EXAMPLES_WEBHOOK_ROUTE_IDS, async ({ pool, app }) => {
      const response = await app.request('/v1/examples/echo/ping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'smoke' }),
      });
      expect(response.status).toBe(202);
      const body = (await response.json()) as { type: string };
      expect(body.type).toBe('example.ping.v1');
      const stored = await selectEventById(
        pool,
        (body as { event_id: string }).event_id,
      );
      expect(stored?.type).toBe('example.ping.v1');
    });
  });

  it('omits POST /v1/prs when only example routes are mounted', async () => {
    await withFreshApp(EXAMPLES_WEBHOOK_ROUTE_IDS, async ({ app }) => {
      const openapi = await app.request('/openapi.json');
      const doc = (await openapi.json()) as {
        paths?: Record<string, unknown>;
      };
      expect(doc.paths?.['/v1/prs']).toBeUndefined();
      expect(doc.paths?.['/v1/examples/notifier/ticket']).toBeDefined();
    });
  });
});

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
