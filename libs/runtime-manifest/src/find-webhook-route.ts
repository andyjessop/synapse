import {
  WEBHOOK_ROUTE_CATALOG,
  type WebhookRouteId,
  webhookIngressKey,
} from './webhook-route-catalog.js';

/** Stable id for non-catalog routes (health, OpenAPI). */
export const INTERNAL_WEBHOOK_ROUTE_ID = 'synapse.webhooks.internal' as const;

export type ResolvedWebhookRoute =
  | { routeId: WebhookRouteId; ingressKey: string }
  | { routeId: typeof INTERNAL_WEBHOOK_ROUTE_ID; ingressKey: string };

/**
 * Resolves a mounted webhook route id from HTTP method and path.
 * Returns `undefined` when the path is not in the catalog (treat as internal).
 */
export function findWebhookRoute(
  method: string,
  path: string,
): ResolvedWebhookRoute | undefined {
  const ingressKey = webhookIngressKey(method, path);
  for (const [routeId, route] of Object.entries(WEBHOOK_ROUTE_CATALOG)) {
    if (webhookIngressKey(route.method, route.path) === ingressKey) {
      return { routeId: routeId as WebhookRouteId, ingressKey };
    }
  }
  return undefined;
}

/** Catalog match or internal fallback for observability labels. */
export function resolveWebhookRouteForObservability(
  method: string,
  path: string,
): ResolvedWebhookRoute {
  return (
    findWebhookRoute(method, path) ?? {
      routeId: INTERNAL_WEBHOOK_ROUTE_ID,
      ingressKey: webhookIngressKey(method, path),
    }
  );
}
