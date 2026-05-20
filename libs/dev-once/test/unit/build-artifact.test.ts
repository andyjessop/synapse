import { buildJaegerTraceUrl } from 'runtime-observability';
import { describe, expect, it } from 'vitest';

import { synapseRunArtifactSchema } from '../../src/artifact-schema.js';

describe('buildSynapseRunArtifact observability', () => {
  it('schema accepts direct Jaeger trace URLs with trace id', () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const traceparent = `00-${traceId}-00f067aa0ba902b7-01`;
    const jaegerTraceUrl = buildJaegerTraceUrl(
      'http://127.0.0.1:26686',
      traceparent,
    );

    expect(jaegerTraceUrl).toBe(`http://127.0.0.1:26686/trace/${traceId}`);

    const parsed = synapseRunArtifactSchema.parse({
      version: 1,
      status: 'succeeded',
      manifest: { name: 'example', path: 'manifests/examples/echo.json' },
      scenario: {
        id: 'example/echo',
        path: 'scenarios/echo.scenarios.json',
        title: 'Echo',
      },
      events: [],
      agentRuns: [],
      observability: { traceId, jaegerTraceUrl },
    });

    expect(parsed.observability?.jaegerTraceUrl).toBe(jaegerTraceUrl);
    expect(parsed.observability?.traceId).toBe(traceId);
  });
});
