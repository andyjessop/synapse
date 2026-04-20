import { randomUUID } from 'node:crypto';
import type { ServerType } from '@hono/node-server';
import { serve } from '@hono/node-server';
import { isReviewPrPiClientConfigured } from 'agent-reviewer';
import { writeDevSession } from 'dev-cli-shared';
import { getRepoRoot } from 'runtime-config';
import {
  loadValidatedManifestRegistry,
  parseRuntimeManifestFile,
  resolveManifestPath,
  resolveManifestWebhookRouteIds,
} from 'runtime-manifest';
import { initializeObservability } from 'runtime-observability';
import {
  createRuntimeStore,
  createRuntimeStorePool,
  migrateRuntimeStore,
  type RuntimePool,
} from 'runtime-store';
import { wrapManifestRuntimeRegistry } from 'runtime-worker';

import { createWebhooksApp } from '../../../apps/webhooks/src/app.js';
import {
  bootstrapTestWorker,
  DEFAULT_INTEGRATION_DATABASE_URL,
  probeIntegrationInfra,
  redisUrlForSchema,
  resetRedis,
  type TestWorkerHandle,
} from '../../runtime-worker/test/integration/harness.js';

export type StartTestDevServerInput = {
  manifestPath: string;
  repoRoot?: string;
  env?: Record<string, string | undefined>;
};

export type TestDevServerHandle = {
  repoRoot: string;
  /** Pass to `runDevOnce({ env })` so ingress hits this server. */
  env: Record<string, string | undefined>;
  stop(): Promise<void>;
};

type RunningTestDevServer = {
  repoRoot: string;
  env: Record<string, string | undefined>;
  admin: RuntimePool;
  schema: string;
  pool: RuntimePool;
  worker: TestWorkerHandle;
  httpServer: ServerType;
  observability: ReturnType<typeof initializeObservability>;
};

export async function startTestDevServer(
  input: StartTestDevServerInput,
): Promise<TestDevServerHandle> {
  const infra = await probeIntegrationInfra();
  if (!infra) {
    throw new Error(
      'Integration infra unavailable (Postgres/Redis). Run npm run dev:infra.',
    );
  }

  const repoRoot = input.repoRoot ?? getRepoRoot(import.meta.url);
  const absManifest = resolveManifestPath(
    repoRoot,
    input.env ?? process.env,
    input.manifestPath,
  );
  const parsedManifest = parseRuntimeManifestFile(absManifest);
  const webhookRouteIds = resolveManifestWebhookRouteIds(parsedManifest);

  const baseEnv: Record<string, string | undefined> = {
    ...(input.env ?? process.env),
    SYNAPSE_RUNTIME_MANIFEST: absManifest,
  };

  if (
    webhookRouteIds.includes('synapse.webhooks.prs.v1') &&
    parsedManifest.agents.some((agent) => agent.name === 'agent-reviewer') &&
    !isReviewPrPiClientConfigured()
  ) {
    baseEnv.AGENT_REVIEWER_HERMETIC = baseEnv.AGENT_REVIEWER_HERMETIC ?? '1';
  }

  const loaded = await loadValidatedManifestRegistry({
    repoRoot,
    manifestPath: absManifest,
    env: baseEnv,
  });
  const manifest = loaded.manifest;

  const schema = `test_dev_${randomUUID().replaceAll('-', '_')}`;
  const databaseUrl = DEFAULT_INTEGRATION_DATABASE_URL;
  const admin = createRuntimeStorePool({ databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = createRuntimeStorePool({ databaseUrl, max: 8, schema });
  await migrateRuntimeStore(pool);
  const store = createRuntimeStore(pool);
  const redisUrl = redisUrlForSchema(
    process.env.RUNTIME_INTEGRATION_REDIS_URL ?? 'redis://127.0.0.1:26379',
    schema,
  );

  const registry = wrapManifestRuntimeRegistry(loaded.registry);
  await resetRedis(redisUrl);
  const worker = await bootstrapTestWorker({
    pool,
    store,
    redisUrl,
    registry,
  });

  const observability = initializeObservability({
    serviceName: 'webhooks-test',
    mode: 'test',
  });

  const { app } = createWebhooksApp({
    pool,
    observability,
    repoRoot,
    redisUrl,
    webhookRouteIds,
  });

  const webhooksHost = '127.0.0.1';
  let httpServer!: ServerType;
  const webhooksPort = await new Promise<number>((resolve, reject) => {
    try {
      httpServer = serve(
        {
          fetch: app.fetch,
          hostname: webhooksHost,
          port: 0,
        },
        (info) => resolve(info.port),
      );
    } catch (error) {
      reject(error);
    }
  });

  writeDevSession(repoRoot, {
    manifest_path: absManifest,
    manifest_name: manifest.name,
    webhooks: { routes: webhookRouteIds },
  });

  const env: Record<string, string | undefined> = {
    ...(input.env ?? process.env),
    WEBHOOKS_HOST: webhooksHost,
    WEBHOOKS_PORT: String(webhooksPort),
    DATABASE_URL: databaseUrl,
    SYNAPSE_PG_SCHEMA: schema,
  };

  const running: RunningTestDevServer = {
    repoRoot,
    env,
    admin,
    schema,
    pool,
    worker,
    httpServer,
    observability,
  };

  return {
    repoRoot,
    env,
    stop: async () => stopRunningTestDevServer(running),
  };
}

async function stopRunningTestDevServer(
  running: RunningTestDevServer,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    running.httpServer.close((error) => (error ? reject(error) : resolve()));
  });
  await running.observability.shutdown();
  await running.worker.shutdown();
  await running.pool.end();
  await running.admin.query(`drop schema if exists ${running.schema} cascade`);
  await running.admin.end();
}

export async function withTestDevServer<T>(
  input: StartTestDevServerInput,
  run: (handle: TestDevServerHandle) => Promise<T>,
): Promise<T> {
  const handle = await startTestDevServer(input);
  try {
    return await run(handle);
  } finally {
    await handle.stop();
  }
}
