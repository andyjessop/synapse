import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { parseRuntimeManifestFile } from 'runtime-manifest';
import { initializeObservability } from 'runtime-observability';
import { describe, expect, it } from 'vitest';

import { mountInvokeRoutes } from '../../src/routes/invoke.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));
const manifest = parseRuntimeManifestFile(
  join(repoRoot, 'manifests/application.json'),
);

describe('live mode missing credentials', () => {
  it('returns adapter_live_deps_missing instead of adapter_vendor_error', async () => {
    const app = new Hono();
    mountInvokeRoutes(app, {
      manifest,
      liveDeps: {},
      observability: initializeObservability({
        serviceName: 'adapters',
        mode: 'test',
      }),
      maxBodyBytes: 1_000_000,
    });

    const res = await app.request(
      '/v1/adapters/synapse.adapters.gitlab.v1/fetchChanges',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          params: { projectId: 202, mergeRequestIid: 42 },
        }),
      },
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('adapter_live_deps_missing');
  });
});
