import type { OpenAPIHono } from '@hono/zod-openapi';
import type { ObservabilityHandle } from 'runtime-observability';
import type { RuntimePool } from 'runtime-store';

import { mountPollRoutes } from './polling/mount-poll-routes.js';
import {
  mountPollSupervisors,
  type PollSupervisorSubscription,
} from './polling/mount-poll-supervisors.js';
import type { ResolvedIngressAppConfig } from './resolve-ingress-app-config.js';
import { mountWebhookRoutes } from './webhooks/webhook-route-registry.js';

export type MountIngressSurfacesDeps = {
  pool: RuntimePool;
  redisUrl?: string;
  observability?: ObservabilityHandle;
};

export type MountedIngressSurfaces = {
  startPollSupervisors: (options?: {
    startImmediately?: boolean;
  }) => PollSupervisorSubscription[];
};

function requirePollRedisUrl(redisUrl: string | undefined): string {
  if (redisUrl === undefined || redisUrl.trim() === '') {
    throw new Error('Poll sources require redisUrl');
  }
  return redisUrl;
}

export function mountIngressSurfaces(
  app: OpenAPIHono,
  config: ResolvedIngressAppConfig,
  deps: MountIngressSurfacesDeps,
): MountedIngressSurfaces {
  const { repoRoot, env, webhookRouteIds, pollSources } = config;

  if (webhookRouteIds.length > 0) {
    mountWebhookRoutes(app, webhookRouteIds, {
      pool: deps.pool,
      repoRoot,
      redisUrl: deps.redisUrl,
      observability: deps.observability,
    });
  }

  if (pollSources.length > 0) {
    const redisUrl = requirePollRedisUrl(deps.redisUrl);
    mountPollRoutes(app, {
      pool: deps.pool,
      repoRoot,
      redisUrl,
      observability: deps.observability,
      env,
      resolvedSources: pollSources,
    });
  }

  const startPollSupervisors = (options?: { startImmediately?: boolean }) => {
    if (pollSources.length === 0) {
      return [];
    }
    const redisUrl = requirePollRedisUrl(deps.redisUrl);
    return mountPollSupervisors({
      sources: pollSources,
      pool: deps.pool,
      repoRoot,
      redisUrl,
      observability: deps.observability,
      env,
      startImmediately: options?.startImmediately,
    });
  };

  return { startPollSupervisors };
}
