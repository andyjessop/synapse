import type { RuntimeManifest } from './manifest-schema.js';
import {
  POLL_SOURCE_CATALOG,
  type PollSourceCatalogEntry,
  type PollSourceId,
} from './poll-source-catalog.js';
import {
  WEBHOOK_ROUTE_CATALOG,
  type WebhookRouteId,
} from './webhook-route-catalog.js';

export type ResolvedIngressSource =
  | {
      kind: 'webhook';
      source: WebhookRouteId;
      method: string;
      path: string;
    }
  | {
      kind: 'poll';
      source: PollSourceId;
      catalog: PollSourceCatalogEntry;
    };

function isWebhookSource(source: string): source is WebhookRouteId {
  return source in WEBHOOK_ROUTE_CATALOG;
}

function isPollSource(source: string): source is PollSourceId {
  return source in POLL_SOURCE_CATALOG;
}

export function resolveScenarioIngressSource(
  source: string,
  manifest: RuntimeManifest,
  manifestName: string,
): ResolvedIngressSource {
  if (isWebhookSource(source)) {
    const mounted =
      manifest.webhooks?.some((w) => w.source === source) ?? false;
    if (!mounted) {
      throw new Error(
        `Scenario ingress source ${source} is not mounted on manifest ${manifestName}`,
      );
    }
    const route = WEBHOOK_ROUTE_CATALOG[source];
    return {
      kind: 'webhook',
      source,
      method: route.method,
      path: route.path,
    };
  }

  if (isPollSource(source)) {
    const entry = manifest.pollers?.find((p) => p.source === source);
    if (entry === undefined || entry.enabled === false) {
      throw new Error(
        `Scenario ingress source ${source} is not mounted or is disabled on manifest ${manifestName}`,
      );
    }
    return {
      kind: 'poll',
      source,
      catalog: POLL_SOURCE_CATALOG[source],
    };
  }

  throw new Error(`Unknown scenario ingress source: ${source}`);
}
