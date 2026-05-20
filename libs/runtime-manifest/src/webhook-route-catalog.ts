import { z } from 'zod';

import type { RuntimeManifest } from './manifest-schema.js';

/** Authoritative catalog of webhook ingress routes (ids, method, path). Registration lives in `apps/ingress`. */
export const WEBHOOK_ROUTE_CATALOG = {
  'synapse.webhooks.prs.v1': {
    method: 'POST',
    path: '/v1/prs',
    description: 'GitLab merge request webhook → pr.received.v1',
    /** Headers `dev:once` sends so ingress matches production GitLab webhooks. */
    defaultHeaders: {
      'X-Gitlab-Event': 'Merge Request Hook',
    },
  },
  'synapse.webhooks.example-echo-ping.v1': {
    method: 'POST',
    path: '/v1/examples/echo/ping',
    description: 'Example echo ping → example.ping.v1',
  },
  'synapse.webhooks.example-notifier-ticket.v1': {
    method: 'POST',
    path: '/v1/examples/notifier/ticket',
    description: 'Example notifier ticket → ticket.opened.v1',
  },
} as const;

export type WebhookRouteId = keyof typeof WEBHOOK_ROUTE_CATALOG;

const routeIdTuple = Object.keys(WEBHOOK_ROUTE_CATALOG) as [
  WebhookRouteId,
  ...WebhookRouteId[],
];

export const webhookRouteIdSchema = z.enum(routeIdTuple);

export const DEFAULT_WEBHOOK_ROUTE_IDS: WebhookRouteId[] = [
  'synapse.webhooks.prs.v1',
];

export const EXAMPLES_WEBHOOK_ROUTE_IDS: WebhookRouteId[] = [
  'synapse.webhooks.example-echo-ping.v1',
  'synapse.webhooks.example-notifier-ticket.v1',
];

/** Webhook route ids declared in the manifest (`webhooks[].source`), or catalog default when omitted. */
export function resolveManifestWebhookRouteIds(
  manifest: RuntimeManifest,
): WebhookRouteId[] {
  const mounted = declaredManifestWebhookRouteIds(manifest);
  return mounted.length > 0 ? mounted : DEFAULT_WEBHOOK_ROUTE_IDS;
}

/** Declared routes only — empty when `webhooks` is omitted (worker-only manifests, ingress mount lists). */
export function declaredManifestWebhookRouteIds(
  manifest: RuntimeManifest,
): WebhookRouteId[] {
  return manifest.webhooks?.map((entry) => entry.source) ?? [];
}

export function webhookIngressKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

export function mountedWebhookIngressKeys(
  manifest: RuntimeManifest,
): Set<string> {
  const keys = new Set<string>();
  for (const routeId of resolveManifestWebhookRouteIds(manifest)) {
    const route = WEBHOOK_ROUTE_CATALOG[routeId];
    keys.add(webhookIngressKey(route.method, route.path));
  }
  return keys;
}

export function fixtureIngressIsMounted(
  ingress: { method: string; path: string },
  manifest: RuntimeManifest,
): boolean {
  return mountedWebhookIngressKeys(manifest).has(
    webhookIngressKey(ingress.method, ingress.path),
  );
}
