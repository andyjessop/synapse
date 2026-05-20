import { Hono } from 'hono';
import { parseRuntimeManifestFile } from 'runtime-manifest';
import {
  initializeObservability,
  type ObservabilityHandle,
} from 'runtime-observability';

import { isDevScenarioContextEnabled } from './env.js';
import { mountDevScenarioRunRoutes } from './routes/dev-scenario-runs.js';
import { mountInvokeRoutes } from './routes/invoke.js';
import { createAdapterLiveDeps } from './shipped-adapter-runtime.js';

const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

export type CreateAdaptersAppInput = {
  manifestPath: string;
  env: NodeJS.ProcessEnv;
  observability?: ObservabilityHandle;
};

export type AdaptersApp = {
  app: Hono;
  shutdown: () => Promise<void>;
};

export function createAdaptersApp(input: CreateAdaptersAppInput): AdaptersApp {
  const manifest = parseRuntimeManifestFile(input.manifestPath);
  const observability =
    input.observability ??
    initializeObservability({
      serviceName: 'adapters',
      mode: input.env.NODE_ENV === 'test' ? 'test' : 'local',
    });
  const liveDeps = createAdapterLiveDeps(input.env);

  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  mountInvokeRoutes(app, {
    manifest,
    liveDeps,
    observability,
    maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
  });

  if (isDevScenarioContextEnabled(input.env)) {
    mountDevScenarioRunRoutes(app, { manifest });
  }

  return {
    app,
    shutdown: () => observability.shutdown(),
  };
}

export function resolveAdaptersManifestPath(
  env: Record<string, string | undefined>,
  repoRoot: string,
): string {
  const raw = env.SYNAPSE_RUNTIME_MANIFEST?.trim();
  if (raw === undefined || raw === '') {
    throw new Error('SYNAPSE_RUNTIME_MANIFEST is required for apps/adapters');
  }
  return raw.startsWith('/') ? raw : `${repoRoot}/${raw}`;
}
