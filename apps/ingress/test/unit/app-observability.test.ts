import {
  getFinishedSpans,
  initializeObservability,
  resetTestExporters,
} from 'runtime-observability';
import { describe, expect, it } from 'vitest';
import { createIngressApp } from '../../src/app.js';

describe('createIngressApp observability', () => {
  it('records ingress.request spans with route id and HTTP attributes', async () => {
    const observability = initializeObservability({
      serviceName: 'webhooks-test',
      mode: 'test',
    });
    resetTestExporters(observability);
    const pool = { query: async () => ({ rowCount: 0, rows: [] }) } as never;
    const { app } = createIngressApp({
      pool,
      observability,
      webhookRouteIds: [],
    });

    const response = await app.request('/healthz');
    expect(response.status).toBe(200);

    await observability.forceFlush();
    const spans = getFinishedSpans(observability);
    const ingressSpan = spans.find((s) => s.name === 'ingress request');
    expect(ingressSpan).toBeDefined();
    expect(ingressSpan?.attributes['synapse.ingress.route_id']).toBe(
      'synapse.webhooks.internal',
    );
    expect(ingressSpan?.attributes['http.request.method']).toBe('GET');
    expect(ingressSpan?.attributes['http.route']).toBe('/healthz');
    expect(ingressSpan?.attributes['http.response.status_code']).toBe(200);

    await observability.shutdown();
  });
});
