import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { closeAllAgentSqliteHandles } from 'runtime-agent-sqlite';
import {
  getRepoRoot,
  loadDotEnvLocal,
  parseRuntimeConfig,
} from 'runtime-config';
import {
  initializeObservability,
  type ObservabilityHandle,
} from 'runtime-observability';
import {
  createRuntimeStore,
  createRuntimeStorePool,
  migrateRuntimeStore,
  type RuntimePool,
} from 'runtime-store';
import {
  REACTOR_QUEUE_NAME,
  type RuntimeLogger,
  type StreamSubscription,
  startPlanningStream,
  startQueueingStream,
  startRepairStream,
} from 'runtime-worker';
import { z } from 'zod';
import { loadWorkerManifestRegistry } from './manifest-registry';
import { processReactorJob } from './process-reactor-job.js';

const workerEnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1).optional(),
    POSTGRES_URL: z.string().min(1).optional(),
    REDIS_URL: z.string().min(1).optional(),
    SYNAPSE_RUNTIME_MANIFEST: z.string().min(1).optional(),
  })
  .passthrough();

export type BootstrapWorkerResult = {
  shutdown(): Promise<void>;
};

const logger: RuntimeLogger = {
  error: (fields, message) => console.error(message, fields),
  warn: (fields, message) => console.warn(message, fields),
};

type WorkerResources = {
  pool?: RuntimePool;
  connection?: IORedis;
  queue?: Queue;
  worker?: Worker;
  subscriptions: StreamSubscription[];
  observability?: ObservabilityHandle;
};

async function disposeWorkerResources(
  resources: WorkerResources,
): Promise<void> {
  for (const subscription of resources.subscriptions) {
    subscription.unsubscribe();
  }
  resources.subscriptions.length = 0;
  await resources.worker?.close();
  resources.worker = undefined;
  await resources.queue?.close();
  resources.queue = undefined;
  await resources.connection?.quit();
  resources.connection = undefined;
  closeAllAgentSqliteHandles();
  await resources.pool?.end();
  resources.pool = undefined;
  await resources.observability?.shutdown();
  resources.observability = undefined;
}

export function parseWorkerCliManifest(
  argv: readonly string[],
): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--manifest') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error('--manifest requires a path argument');
      }
      return value;
    }
  }
  return undefined;
}

export async function bootstrapWorker(
  env: Record<string, string | undefined> = process.env,
  metaUrl: string | URL = import.meta.url,
  cliManifest?: string,
): Promise<BootstrapWorkerResult> {
  const resources: WorkerResources = { subscriptions: [] };

  try {
    const repoRoot = getRepoRoot(metaUrl);
    const envWithLocal = loadDotEnvLocal(`${repoRoot}/.env.local`, env);
    workerEnvSchema.parse(envWithLocal);
    const config = parseRuntimeConfig(envWithLocal);

    const manifestArgv =
      cliManifest ?? parseWorkerCliManifest(process.argv.slice(2));
    const { registry, manifest, manifestPath } =
      await loadWorkerManifestRegistry(envWithLocal, metaUrl, manifestArgv);

    resources.observability = initializeObservability({
      serviceName: 'worker',
      mode: envWithLocal.NODE_ENV === 'test' ? 'test' : 'local',
    });

    resources.pool = createRuntimeStorePool({
      databaseUrl: config.databaseUrl,
      max: 12,
    });
    await migrateRuntimeStore(resources.pool);

    const agentSqliteBaseDir =
      config.agentSqliteDir !== undefined && config.agentSqliteDir.trim() !== ''
        ? isAbsolute(config.agentSqliteDir)
          ? config.agentSqliteDir
          : join(repoRoot, config.agentSqliteDir)
        : join(repoRoot, 'tmp/dev/agent-sqlite');

    const store = createRuntimeStore(resources.pool);
    resources.connection = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: null,
    });
    resources.queue = new Queue(REACTOR_QUEUE_NAME, {
      connection: resources.connection,
    });
    resources.subscriptions.push(
      startPlanningStream({ store, registry, logger }),
      startQueueingStream({ store, queue: resources.queue, logger }),
      startRepairStream({ store, logger }),
    );
    const observability = resources.observability!;
    resources.worker = new Worker(
      REACTOR_QUEUE_NAME,
      async (job) =>
        processReactorJob(job, {
          store,
          observability,
          executeDeps: {
            store,
            registry,
            pool: resources.pool,
            repoRoot,
            env: envWithLocal,
            agentSqlite: {
              baseDir: agentSqliteBaseDir,
              lockTimeoutMs: config.agentSqliteAdvisoryLockTimeoutMs,
              migrationMaxMsPerMigration: config.agentSqliteMigrationMaxMs,
            },
          },
        }),
      { connection: resources.connection.duplicate(), concurrency: 4 },
    );

    return {
      shutdown: async () => {
        await disposeWorkerResources(resources);
      },
    };
  } catch (error) {
    await disposeWorkerResources(resources);
    throw error;
  }
}

let active: BootstrapWorkerResult | undefined;

async function shutdownActive(): Promise<void> {
  if (active !== undefined) {
    await active.shutdown();
    active = undefined;
  }
}

export async function startWorker(): Promise<BootstrapWorkerResult> {
  active = await bootstrapWorker();
  console.log(
    'worker ready (streams: planning, queueing, repair; BullMQ reactor queue)',
  );
  process.once('SIGINT', () => {
    void shutdownActive().finally(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    void shutdownActive().finally(() => process.exit(0));
  });
  return active;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void startWorker().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
