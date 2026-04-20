import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REVIEW_PR_INGRESS_SOURCE } from 'agent-reviewer';
import { getRepoRoot, parseRuntimeConfig } from 'runtime-config';
import {
  createRuntimeStorePool,
  migrateRuntimeStore,
  type RuntimePool,
  selectEventById,
} from 'runtime-store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWebhooksApp } from '../../src/app';

const dockerContainerName = `webhooks-prs-test-${randomUUID()}`;
const fixturePath = join(
  getRepoRoot(import.meta.url),
  'fixtures/agent-reviewer/gitlab-merge-request.json',
);
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
  run: (input: {
    pool: RuntimePool;
    app: ReturnType<typeof createWebhooksApp>['app'];
  }) => Promise<void>,
): Promise<void> {
  const { databaseUrl } = parseRuntimeConfig({
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
  });
  const schema = `webhooks_prs_${randomUUID().replaceAll('-', '_')}`;
  const admin = createRuntimeStorePool({ databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = createRuntimeStorePool({ databaseUrl, max: 4, schema });
  try {
    await migrateRuntimeStore(pool);
    const { app } = createWebhooksApp({
      pool,
      repoRoot: getRepoRoot(import.meta.url),
    });
    await run({ pool, app });
  } finally {
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
}

describe('POST /v1/prs', () => {
  it('accepts GitLab merge request fixture and stores pr.received.v1', async () => {
    await withFreshApp(async ({ pool, app }) => {
      const fixture = readFileSync(fixturePath, 'utf8');
      const response = await app.request('/v1/prs', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-gitlab-event': 'Merge Request Hook',
        },
        body: fixture,
      });
      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        event_id: string;
        type: string;
        subject: string;
      };
      expect(body.type).toBe('pr.received.v1');
      expect(body.subject).toBe('gitlab:synapse/synapse!42');

      const stored = await selectEventById(pool, body.event_id);
      expect(stored?.type).toBe('pr.received.v1');
      expect(stored?.source).toBe(REVIEW_PR_INGRESS_SOURCE);
    });
  });

  it('returns 422 for wrong GitLab header', async () => {
    await withFreshApp(async ({ app }) => {
      const fixture = readFileSync(fixturePath, 'utf8');
      const response = await app.request('/v1/prs', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-gitlab-event': 'Push Hook',
        },
        body: fixture,
      });
      expect(response.status).toBe(422);
    });
  });

  it('returns 422 for missing GitLab header', async () => {
    await withFreshApp(async ({ app }) => {
      const fixture = readFileSync(fixturePath, 'utf8');
      const response = await app.request('/v1/prs', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: fixture,
      });
      expect(response.status).toBe(422);
    });
  });

  it('includes POST /v1/prs in OpenAPI', async () => {
    await withFreshApp(async ({ app }) => {
      const openapi = await app.request('/openapi.json');
      const doc = (await openapi.json()) as {
        paths?: Record<string, unknown>;
      };
      expect(doc.paths?.['/v1/prs']).toBeDefined();
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
