import type { Server } from 'node:http';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { getRepoRoot, loadDotEnvLocal } from 'runtime-config';

import { createAdaptersApp, resolveAdaptersManifestPath } from './app.js';
import { parseAdaptersEnv } from './env.js';

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function main(): Promise<void> {
  const repoRoot = getRepoRoot(import.meta.url);
  const env = loadDotEnvLocal(join(repoRoot, '.env.local'), process.env);
  const parsed = parseAdaptersEnv(env);
  const manifestPath = resolveAdaptersManifestPath(env, repoRoot);
  const { app, shutdown } = createAdaptersApp({ manifestPath, env });

  const server = serve(
    {
      fetch: app.fetch,
      hostname: parsed.ADAPTERS_HOST,
      port: parsed.ADAPTERS_PORT,
    },
    (info) => {
      console.log(`Adapters  http://${info.address}:${info.port}`);
    },
  ) as Server;

  const stop = async () => {
    await closeServer(server);
    await shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
