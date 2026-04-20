import { join } from 'node:path';
import { getRepoRoot } from 'runtime-config';
import { EXAMPLES_WEBHOOK_ROUTE_IDS } from 'runtime-manifest';
import { describe, expect, it } from 'vitest';
import { createWebhooksApp, resolveWebhookRouteIdsForApp } from '../../src/app';

describe('resolveWebhookRouteIdsForApp', () => {
  it('defaults to PR route when unset', () => {
    expect(resolveWebhookRouteIdsForApp({})).toEqual([
      'synapse.webhooks.prs.v1',
    ]);
  });

  it('uses explicit webhook route ids', () => {
    expect(
      resolveWebhookRouteIdsForApp({
        webhookRouteIds: EXAMPLES_WEBHOOK_ROUTE_IDS,
      }),
    ).toEqual(EXAMPLES_WEBHOOK_ROUTE_IDS);
  });

  it('reads route ids from manifest path', () => {
    const repoRoot = getRepoRoot(import.meta.url);
    expect(
      resolveWebhookRouteIdsForApp({
        manifestPath: join(repoRoot, 'manifests/application.json'),
      }),
    ).toEqual(['synapse.webhooks.prs.v1']);
  });

  it('exposes mounted paths in OpenAPI doc', async () => {
    const pool = { query: async () => ({ rows: [] }) } as never;
    const { app } = createWebhooksApp({
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
