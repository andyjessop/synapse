import type { OpenAPIHono } from '@hono/zod-openapi';
import type { WebhookRouteId } from 'runtime-manifest';
import type { RuntimePool } from 'runtime-store';

import { registerExampleEchoRoutes } from './routes/example-echo.js';
import { registerExampleNotifierRoutes } from './routes/example-notifier.js';
import { registerPrRoutes } from './routes/prs.js';

export type MountWebhookRoutesDeps = {
  pool: RuntimePool;
  repoRoot: string;
  redisUrl?: string;
};

type RouteRegistrar = (app: OpenAPIHono, deps: MountWebhookRoutesDeps) => void;

const WEBHOOK_ROUTE_REGISTRARS: Record<WebhookRouteId, RouteRegistrar> = {
  'synapse.webhooks.prs.v1': registerPrRoutes,
  'synapse.webhooks.example-echo-ping.v1': registerExampleEchoRoutes,
  'synapse.webhooks.example-notifier-ticket.v1': registerExampleNotifierRoutes,
};

export function mountWebhookRoutes(
  app: OpenAPIHono,
  routeIds: readonly WebhookRouteId[],
  deps: MountWebhookRoutesDeps,
): void {
  const mounted = new Set<WebhookRouteId>();
  for (const routeId of routeIds) {
    if (mounted.has(routeId)) {
      throw new Error(`Duplicate webhook route id in mount list: ${routeId}`);
    }
    mounted.add(routeId);
    WEBHOOK_ROUTE_REGISTRARS[routeId](app, deps);
  }
}
