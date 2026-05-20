import { join } from 'node:path';
import { getRepoRoot } from 'runtime-config';
import { EXAMPLES_WEBHOOK_ROUTE_IDS } from 'runtime-manifest';
import { describe, expect, it } from 'vitest';
import { createIngressApp, resolveIngressAppConfig } from '../../src/app.js';

describe('resolveIngressAppConfig webhook routes', () => {
  it('reads route ids from manifest path once', () => {
    const repoRoot = getRepoRoot(import.meta.url);
    const config = resolveIngressAppConfig({
      pool: {} as never,
      manifestPath: join(repoRoot, 'manifests/application.json'),
    });
    expect(config.webhookRouteIds).toEqual(['synapse.webhooks.prs.v1']);
  });
});

describe('mountWebhookRoutes via createIngressApp', () => {
  it('exposes mounted paths in OpenAPI doc', async () => {
    const pool = { query: async () => ({ rows: [] }) } as never;
    const { app } = createIngressApp({
      pool,
      webhookRouteIds: EXAMPLES_WEBHOOK_ROUTE_IDS,
    });
    const response = await app.request('/openapi.json');
    const doc = (await response.json()) as {
      paths?: Record<string, unknown>;
    };
    expect(doc.paths?.['/v1/examples/echo/ping']).toBeDefined();
    expect(doc.paths?.['/v1/examples/notifier/ticket']).toBeDefined();
  });
});
