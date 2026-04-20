import { OpenAPIHono } from '@hono/zod-openapi';
import { getRepoRoot } from 'runtime-config';
import {
  DEFAULT_WEBHOOK_ROUTE_IDS,
  parseRuntimeManifestFile,
  resolveManifestWebhookRouteIds,
  type WebhookRouteId,
} from 'runtime-manifest';
import {
  type ObservabilityHandle,
  runWithRuntimeSpan,
} from 'runtime-observability';
import type { RuntimePool } from 'runtime-store';
import { registerHealthRoutes } from './routes/health';
import { mountWebhookRoutes } from './webhook-route-registry';

export type CreateWebhooksAppInput = {
  pool: RuntimePool;
  observability?: ObservabilityHandle;
  /** Monorepo root for local ingress run logs (`tmp/dev/runs`). Defaults from this package. */
  repoRoot?: string;
  /** BullMQ Redis URL; used to clear failed reactor jobs before ingress run snapshots. */
  redisUrl?: string;
  /** Route ids from manifest `webhooks.routes`. Defaults to application PR route when omitted. */
  webhookRouteIds?: readonly WebhookRouteId[];
  /** When set, route ids are read from `webhooks.routes` on this manifest file. */
  manifestPath?: string;
};

export type WebhooksApp = {
  app: OpenAPIHono;
};

export function resolveWebhookRouteIdsForApp(
  input: Pick<CreateWebhooksAppInput, 'webhookRouteIds' | 'manifestPath'>,
): WebhookRouteId[] {
  if (input.manifestPath !== undefined) {
    return resolveManifestWebhookRouteIds(
      parseRuntimeManifestFile(input.manifestPath),
    );
  }
  return [...(input.webhookRouteIds ?? DEFAULT_WEBHOOK_ROUTE_IDS)];
}

export function createWebhooksApp(input: CreateWebhooksAppInput): WebhooksApp {
  const repoRoot = input.repoRoot ?? getRepoRoot(import.meta.url);
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            error: {
              code: 'invalid_request',
              message: 'Invalid request',
              details: { issues: result.error.issues },
            },
          },
          400,
        );
      }
    },
  });

  if (input.observability !== undefined) {
    app.use('*', async (c, next) => {
      const routeId = c.req.path.split('/').filter(Boolean)[0] ?? 'root';
      return runWithRuntimeSpan({
        hop: 'adapter.request',
        tracer: input.observability!.tracer,
        operation: routeId,
        run: async () => next(),
      });
    });
  }

  registerHealthRoutes(app);

  mountWebhookRoutes(app, resolveWebhookRouteIdsForApp(input), {
    pool: input.pool,
    repoRoot,
    redisUrl: input.redisUrl,
  });

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Synapse Webhooks API',
      version: '1.0.0',
    },
  });

  return { app };
}
