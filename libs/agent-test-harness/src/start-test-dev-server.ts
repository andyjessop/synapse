import { randomUUID } from 'node:crypto';
import type { ServerType } from '@hono/node-server';
import { serve } from '@hono/node-server';
import type { AgentDefinition } from 'runtime-agent';
import { getRepoRoot } from 'runtime-config';
import {
  loadValidatedManifestRegistry,
  resolveManifestPath,
} from 'runtime-manifest';
import { initializeObservability } from 'runtime-observability';
import {
  createRuntimeStore,
  createRuntimeStorePool,
  migrateRuntimeStore,
  type RuntimePool,
} from 'runtime-store';
import { wrapManifestRuntimeRegistry } from 'runtime-worker';
import { validateScenarioForManifest } from 'synapse-scenarios';

import { createIngressApp } from '../../../apps/ingress/src/app.js';
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
  shippedAgents: ReadonlyMap<string, AgentDefinition>;
  knownEventTypes: ReadonlySet<string>;
  repoRoot?: string;
  /** Merged before manifest load and ingress startup (e.g. `AGENT_REVIEWER_HERMETIC=1`). */
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
  const baseEnv: Record<string, string | undefined> = {
    ...(input.env ?? process.env),
    SYNAPSE_RUNTIME_MANIFEST: absManifest,
  };

  const loaded = await loadValidatedManifestRegistry({
    repoRoot,
    manifestPath: absManifest,
    shippedAgents: input.shippedAgents,
    knownEventTypes: input.knownEventTypes,
    env: baseEnv,
    validateScenarioForManifest,
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
  baseEnv.SYNAPSE_PG_SCHEMA = schema;
  baseEnv.DATABASE_URL = databaseUrl;
  baseEnv.REDIS_URL = redisUrl;

  const registry = wrapManifestRuntimeRegistry(loaded.registry);
  await resetRedis(redisUrl);
  const worker = await bootstrapTestWorker({
    pool,
    store,
    redisUrl,
    registry,
  });

  const observability = initializeObservability({
    serviceName: 'ingress',
    mode: 'test',
  });

  const { app: ingressApp } = createIngressApp({
    pool,
    repoRoot,
    manifestPath: absManifest,
    redisUrl,
    observability,
    env: baseEnv,
  });

  const httpServer = await new Promise<ServerType>((resolve, reject) => {
    try {
      const server = serve(
        {
          fetch: ingressApp.fetch,
          hostname: '127.0.0.1',
          port: 0,
        },
        (info) => {
          baseEnv.INGRESS_PORT = String(info.port);
          resolve(server);
        },
      ) as ServerType;
      server.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });

  const running: RunningTestDevServer = {
    repoRoot,
    env: baseEnv,
    admin,
    schema,
    pool,
    worker,
    httpServer,
    observability,
  };

  return {
    repoRoot,
    env: baseEnv,
    stop: async () => {
      await running.worker.shutdown();
      await new Promise<void>((resolve, reject) => {
        running.httpServer.close((err) => (err ? reject(err) : resolve()));
      });
      await running.pool.end();
      await running.admin.query(
        `drop schema if exists ${running.schema} cascade`,
      );
      await running.admin.end();
      await running.observability.shutdown();
    },
  };
}

export async function withTestDevServer<T>(
  input: StartTestDevServerInput,
  fn: (handle: TestDevServerHandle) => Promise<T>,
): Promise<T> {
  const handle = await startTestDevServer(input);
  try {
    return await fn(handle);
  } finally {
    await handle.stop();
  }
}
