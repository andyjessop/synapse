import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { getRepoRoot, loadDotEnvLocal } from 'runtime-config';
import { initializeObservability } from 'runtime-observability';
import { createRuntimeStorePool, migrateRuntimeStore } from 'runtime-store';
import { createWebhooksApp } from './app';
import { parseWebhooksEnv } from './env';

async function main(): Promise<void> {
  const repoRoot = getRepoRoot(import.meta.url);
  const env = loadDotEnvLocal(join(repoRoot, '.env.local'), process.env);
  const parsed = parseWebhooksEnv(env);
  const observability = initializeObservability({
    serviceName: 'webhooks',
    mode: env.NODE_ENV === 'test' ? 'test' : 'local',
  });
  const pool = createRuntimeStorePool({ databaseUrl: parsed.databaseUrl });
  await migrateRuntimeStore(pool);
  const { app } = createWebhooksApp({
    pool,
    observability,
    manifestPath: parsed.SYNAPSE_RUNTIME_MANIFEST,
    repoRoot,
    redisUrl: parsed.redisUrl,
  });

  const server = serve(
    {
      fetch: app.fetch,
      hostname: parsed.WEBHOOKS_HOST,
      port: parsed.WEBHOOKS_PORT,
    },
    (info) => {
      console.log(
        `webhooks listening on http://${info.address}:${info.port} (openapi: /openapi.json)`,
      );
    },
  );

  const shutdown = async () => {
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
