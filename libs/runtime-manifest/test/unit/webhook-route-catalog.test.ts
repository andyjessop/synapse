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
      agents: [
        {
          name: 'a',
          handler: 'examples/agents/example-agent-echo/src/echo-agent.ts',
          handles: ['example.ping.v1'],
        },
      ],
    });
    expect(resolveManifestWebhookRouteIds(manifest)).toEqual(
      DEFAULT_WEBHOOK_ROUTE_IDS,
    );
  });

  it('resolves explicit manifest routes', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'examples',
      agents: [
        {
          name: 'a',
          handler: 'examples/agents/example-agent-echo/src/echo-agent.ts',
          handles: ['example.ping.v1'],
        },
      ],
      webhooks: { routes: EXAMPLES_WEBHOOK_ROUTE_IDS },
    });
    expect(resolveManifestWebhookRouteIds(manifest)).toEqual(
      EXAMPLES_WEBHOOK_ROUTE_IDS,
    );
  });

  it('matches fixture ingress to mounted catalog paths', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'app',
      agents: [
        {
          name: 'a',
          handler: 'examples/agents/example-agent-echo/src/echo-agent.ts',
          handles: ['pr.received.v1'],
        },
      ],
      webhooks: { routes: ['synapse.webhooks.prs.v1'] },
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
