import { OpenAPIHono } from '@hono/zod-openapi';
import type { ResolvedPollSource } from 'runtime-manifest';
import {
  contextFromTraceCarrier,
  type ObservabilityHandle,
  runWithRuntimeSpan,
} from 'runtime-observability';
import { mountIngressSurfaces } from './mount-ingress-surfaces.js';
import type { PollSupervisorSubscription } from './polling/mount-poll-supervisors.js';
import {
  assertPollIngressRedisUrl,
  type CreateIngressAppInput,
  resolveIngressAppConfig,
  resolveWebhookRouteIdsForApp,
} from './resolve-ingress-app-config.js';
import { resolveIngressRouteForObservability } from './resolve-ingress-route-observability.js';
import { registerHealthRoutes } from './routes/health.js';
import {
  isScenarioDevContextEnabled,
  mountScenarioDevRoutes,
} from './scenario/mount-scenario-dev-routes.js';
import { createScenarioWebhookMiddleware } from './scenario/scenario-webhook-middleware.js';

export type { CreateIngressAppInput } from './resolve-ingress-app-config.js';

export type IngressApp = {
  app: OpenAPIHono;
  pollSources: ResolvedPollSource[];
  startPollSupervisors: (options?: {
    startImmediately?: boolean;
  }) => PollSupervisorSubscription[];
};

/** @deprecated Use {@link CreateIngressAppInput} */
export type CreateWebhooksAppInput = CreateIngressAppInput;
/** @deprecated Use {@link IngressApp} */
export type WebhooksApp = IngressApp;

export {
  assertPollIngressRedisUrl,
  resolveIngressAppConfig,
  resolveWebhookRouteIdsForApp,
} from './resolve-ingress-app-config.js';

function runtimeResultForStatus(status: number): 'success' | 'failure' {
  return status >= 200 && status < 500 ? 'success' : 'failure';
}

function registerIngressObservabilityMiddleware(
  app: OpenAPIHono,
  observability: ObservabilityHandle,
): void {
  app.use('*', async (c, next) => {
    const method = c.req.method;
    const path = c.req.path;
    const resolved = resolveIngressRouteForObservability(method, path);
    const parentContext = contextFromTraceCarrier({
      traceparent: c.req.header('traceparent'),
      tracestate: c.req.header('tracestate'),
    });

    return runWithRuntimeSpan({
      hop: 'ingress.request',
      tracer: observability.tracer,
      parentContext,
      ingressRouteId: resolved.ingressRouteId,
      pollSourceId: resolved.pollSourceId,
      operation: resolved.operation,
      adapter: 'http',
      run: async (span) => {
        try {
          await next();
        } finally {
          const status = c.res.status;
          span.setAttribute('http.response.status_code', status);
          span.setAttributes({
            'synapse.result': runtimeResultForStatus(status),
          });
          observability.metrics.recordAdapter({
            adapter: 'http',
            operation: resolved.operation,
            result: runtimeResultForStatus(status),
          });
        }
      },
    });
  });
}

export function createIngressApp(input: CreateIngressAppInput): IngressApp {
  const config = resolveIngressAppConfig(input);
  assertPollIngressRedisUrl(config.pollSources, input.redisUrl);

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
    registerIngressObservabilityMiddleware(app, input.observability);
  }

  registerHealthRoutes(app);
  if (isScenarioDevContextEnabled(config.env)) {
    app.use('*', createScenarioWebhookMiddleware());
    mountScenarioDevRoutes(app, config.env);
  }

  const { startPollSupervisors } = mountIngressSurfaces(app, config, {
    pool: input.pool,
    redisUrl: input.redisUrl,
    observability: input.observability,
  });

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Synapse Ingress API',
      version: '1.0.0',
    },
  });

  return {
    app,
    pollSources: config.pollSources,
    startPollSupervisors,
  };
}

/**
 * @deprecated Use {@link createIngressApp}. Remove after downstream imports migrate.
 */
export const createWebhooksApp = createIngressApp;
