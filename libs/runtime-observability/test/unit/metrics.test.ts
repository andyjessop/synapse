import { describe, expect, it } from 'vitest';
import {
  assertLowCardinalityMetricLabels,
  buildAdapterMetricLabels,
  buildAgentRunMetricLabels,
  buildBullmqMetricLabels,
  buildEventMetricLabels,
  buildOutboxMetricLabels,
  getExportedMetrics,
  initializeObservability,
} from '../../src/index';

describe('metric label builders', () => {
  it('derives bounded event labels from registered event types', () => {
    expect(
      buildEventMetricLabels({
        event_type: 'example.pong.v1',
        result: 'success',
      }),
    ).toEqual({
      event_type: 'example.pong.v1',
      category: 'outcome',
      owner: 'example-echo',
      result: 'success',
    });
  });

  it('keeps metric labels low-cardinality for every runtime area', () => {
    expect(
      buildOutboxMetricLabels({ operation: 'enqueue', result: 'success' }),
    ).toEqual({
      operation: 'enqueue',
      result: 'success',
    });
    expect(
      buildBullmqMetricLabels({
        operation: 'process',
        queue: 'agent.example-echo.example-ping',
        agent: 'example-echo',
        result: 'failure',
      }),
    ).toEqual({
      operation: 'process',
      queue: 'agent.example-echo.example-ping',
      agent: 'example-echo',
      result: 'failure',
    });
    expect(
      buildAdapterMetricLabels({
        adapter: 'http',
        operation: 'fetch',
        result: 'retry',
      }),
    ).toEqual({
      adapter: 'http',
      operation: 'fetch',
      result: 'retry',
    });
    expect(
      buildAgentRunMetricLabels({
        agent: 'example-echo',
        status: 'succeeded',
        replay: 'false',
      }),
    ).toEqual({
      agent: 'example-echo',
      status: 'succeeded',
      replay: 'false',
    });
  });

  it('rejects high-cardinality metric labels', () => {
    expect(() =>
      assertLowCardinalityMetricLabels({
        event_id: 'evt-1',
      }),
    ).toThrow(/High-cardinality/);
    expect(() =>
      assertLowCardinalityMetricLabels({
        'synapse.event.id': 'evt-1',
      }),
    ).toThrow(/High-cardinality/);
  });

  it('drops unknown-event derived labels when no bounded mapping exists', () => {
    expect(
      buildEventMetricLabels({
        event_type: 'external.unknown.v1',
      }),
    ).toEqual({
      event_type: 'external.unknown.v1',
    });
  });
});

describe('runtime metric instruments', () => {
  it('records every runtime metric family into the test exporter', async () => {
    const handle = initializeObservability({
      serviceName: 'runtime-observability-metrics-test',
      mode: 'test',
      registerGlobal: false,
      metricExportIntervalMillis: 10_000,
    });

    handle.metrics.recordEvent({
      event_type: 'example.ping.v1',
      result: 'success',
    });
    handle.metrics.recordOutbox({ operation: 'enqueue', result: 'success' });
    handle.metrics.recordBullmq({
      operation: 'enqueue',
      queue: 'agent.example-echo.example-ping',
      result: 'success',
    });
    handle.metrics.recordAdapter({
      adapter: 'http',
      operation: 'search',
      result: 'success',
    });
    handle.metrics.recordAgentRun({
      agent: 'example-echo',
      status: 'succeeded',
      replay: 'false',
    });

    const resourceMetrics = await getExportedMetrics(handle);
    const metricNames = resourceMetrics.flatMap((resourceMetric) =>
      resourceMetric.scopeMetrics.flatMap((scopeMetric) =>
        scopeMetric.metrics.map((metric) => metric.descriptor.name),
      ),
    );

    expect(metricNames.sort()).toEqual([
      'synapse.adapter.requests',
      'synapse.agent.runs',
      'synapse.bullmq.jobs',
      'synapse.events.recorded',
      'synapse.outbox.operations',
    ]);

    await handle.shutdown();
  });
});
