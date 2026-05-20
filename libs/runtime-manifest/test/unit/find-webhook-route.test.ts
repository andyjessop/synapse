import { describe, expect, it } from 'vitest';
import {
  findWebhookRoute,
  INTERNAL_WEBHOOK_ROUTE_ID,
  resolveWebhookRouteForObservability,
} from '../../src/find-webhook-route.js';

describe('findWebhookRoute', () => {
  it('resolves catalog routes by method and path', () => {
    expect(findWebhookRoute('POST', '/v1/prs')).toEqual({
      routeId: 'synapse.webhooks.prs.v1',
      ingressKey: 'POST /v1/prs',
    });
    expect(findWebhookRoute('post', '/v1/examples/echo/ping')).toEqual({
      routeId: 'synapse.webhooks.example-echo-ping.v1',
      ingressKey: 'POST /v1/examples/echo/ping',
    });
  });

  it('returns undefined for unknown paths', () => {
    expect(findWebhookRoute('GET', '/health')).toBeUndefined();
  });

  it('falls back to internal route id for observability', () => {
    expect(resolveWebhookRouteForObservability('GET', '/health')).toEqual({
      routeId: INTERNAL_WEBHOOK_ROUTE_ID,
      ingressKey: 'GET /health',
    });
  });
});
