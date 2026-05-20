import {
  pollSourceIdSchema,
  resolveWebhookRouteForObservability,
} from 'runtime-manifest';

/** Stable id for poll HTTP tick ingress (low-cardinality observability labels). */
export const INGRESS_POLL_TICK_ROUTE_ID =
  'synapse.ingress.poll.tick.v1' as const;

const POLL_TICK_OPERATION = 'POST /v1/poll/{sourceId}/tick';

export type ResolvedIngressHttpRoute = {
  ingressRouteId: string;
  operation: string;
  pollSourceId?: string;
};

const pollTickPath = /^\/v1\/poll\/([^/]+)\/tick$/;

export function resolveIngressRouteForObservability(
  method: string,
  path: string,
): ResolvedIngressHttpRoute {
  const tickMatch = pollTickPath.exec(path);
  if (tickMatch !== null && method === 'POST') {
    const parsed = pollSourceIdSchema.safeParse(tickMatch[1]);
    return {
      ingressRouteId: INGRESS_POLL_TICK_ROUTE_ID,
      operation: POLL_TICK_OPERATION,
      ...(parsed.success ? { pollSourceId: parsed.data } : {}),
    };
  }

  const webhook = resolveWebhookRouteForObservability(method, path);
  return {
    ingressRouteId: webhook.routeId,
    operation: webhook.ingressKey,
  };
}
