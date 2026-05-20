import { describe, expect, it } from 'vitest';
import {
  INGRESS_POLL_TICK_ROUTE_ID,
  resolveIngressRouteForObservability,
} from '../../src/resolve-ingress-route-observability.js';

describe('resolveIngressRouteForObservability', () => {
  it('classifies poll tick HTTP with route-shaped operation', () => {
    expect(
      resolveIngressRouteForObservability(
        'POST',
        '/v1/poll/synapse.poll.example-in-memory-heartbeat.v1/tick',
      ),
    ).toEqual({
      ingressRouteId: INGRESS_POLL_TICK_ROUTE_ID,
      operation: 'POST /v1/poll/{sourceId}/tick',
      pollSourceId: 'synapse.poll.example-in-memory-heartbeat.v1',
    });
  });

  it('does not throw for malformed poll source id in path', () => {
    expect(
      resolveIngressRouteForObservability('POST', '/v1/poll/not-a-source/tick'),
    ).toEqual({
      ingressRouteId: INGRESS_POLL_TICK_ROUTE_ID,
      operation: 'POST /v1/poll/{sourceId}/tick',
    });
  });

  it('classifies health as internal webhook route id', () => {
    const resolved = resolveIngressRouteForObservability('GET', '/healthz');
    expect(resolved.ingressRouteId).toBe('synapse.webhooks.internal');
    expect(resolved.pollSourceId).toBeUndefined();
  });
});
