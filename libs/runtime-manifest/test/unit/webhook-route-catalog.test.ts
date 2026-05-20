import { describe, expect, it } from 'vitest';
import { parseRuntimeManifestJson } from '../../src/parse.js';
import {
  DEFAULT_WEBHOOK_ROUTE_IDS,
  EXAMPLES_WEBHOOK_ROUTE_IDS,
  fixtureIngressIsMounted,
  resolveManifestWebhookRouteIds,
  WEBHOOK_ROUTE_CATALOG,
} from '../../src/webhook-route-catalog.js';
import { manifestDocumentBase } from '../helpers/manifest-document-base.js';

describe('webhook route catalog', () => {
  it('resolves default routes when webhooks omitted', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'no-webhooks',
      agents: [{ name: 'example-echo' }],
    });
    expect(resolveManifestWebhookRouteIds(manifest)).toEqual(
      DEFAULT_WEBHOOK_ROUTE_IDS,
    );
  });

  it('resolves explicit manifest routes', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'examples',
      agents: [{ name: 'example-echo' }],
      webhooks: EXAMPLES_WEBHOOK_ROUTE_IDS.map((source) => ({ source })),
    });
    expect(resolveManifestWebhookRouteIds(manifest)).toEqual(
      EXAMPLES_WEBHOOK_ROUTE_IDS,
    );
  });

  it('declares GitLab default headers for prs webhook (dev:once)', () => {
    expect(
      WEBHOOK_ROUTE_CATALOG['synapse.webhooks.prs.v1'].defaultHeaders,
    ).toEqual({
      'X-Gitlab-Event': 'Merge Request Hook',
    });
  });

  it('matches fixture ingress to mounted catalog paths', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'app',
      agents: [{ name: 'agent-reviewer' }],
      webhooks: [{ source: 'synapse.webhooks.prs.v1' }],
    });
    expect(
      fixtureIngressIsMounted(
        {
          method: 'POST',
          path: WEBHOOK_ROUTE_CATALOG['synapse.webhooks.prs.v1'].path,
        },
        manifest,
      ),
    ).toBe(true);
    expect(
      fixtureIngressIsMounted(
        { method: 'POST', path: '/v1/examples/echo/ping' },
        manifest,
      ),
    ).toBe(false);
  });
});
