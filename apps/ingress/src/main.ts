import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { getRepoRoot, loadDotEnvLocal } from 'runtime-config';
import { initializeObservability } from 'runtime-observability';
import { createRuntimeStorePool, migrateRuntimeStore } from 'runtime-store';
import { createIngressApp } from './app.js';
import { parseIngressEnv } from './env.js';

async function main(): Promise<void> {
  const repoRoot = getRepoRoot(import.meta.url);
  const env = loadDotEnvLocal(join(repoRoot, '.env.local'), process.env);
  const parsed = parseIngressEnv(env);
  const observability = initializeObservability({
    serviceName: 'ingress',
    mode: env.NODE_ENV === 'test' ? 'test' : 'local',
  });
  const pool = createRuntimeStorePool({ databaseUrl: parsed.databaseUrl });
  await migrateRuntimeStore(pool);
  const { app, startPollSupervisors } = createIngressApp({
    pool,
    observability,
    manifestPath: parsed.SYNAPSE_RUNTIME_MANIFEST,
    repoRoot,
    redisUrl: parsed.redisUrl,
    env,
  });
  const pollSupervisors = startPollSupervisors({ startImmediately: true });

  const server = serve(
    {
      fetch: app.fetch,
      hostname: parsed.INGRESS_HOST,
      port: parsed.INGRESS_PORT,
    },
    (info) => {
      console.log(
        `ingress listening on http://${info.address}:${info.port} (openapi: /openapi.json)`,
      );
    },
  );

  const shutdown = async () => {
    for (const sub of pollSupervisors) {
      sub.unsubscribe();
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await observability.shutdown();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
