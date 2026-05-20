import { defineReactor, defineRegistryAgent } from 'runtime-agent';
import {
  getExportedMetrics,
  getFinishedSpans,
  initializeObservability,
  resetTestExporters,
} from 'runtime-observability';
import { describe, expect, it, vi } from 'vitest';
import { executeRun } from '../../src/execute-run';
import { createRuntimeRegistry } from '../../src/registry';

describe('executeRun observability', () => {
  it('sets agent and reactor on reactor.run spans and records metrics', async () => {
    const observability = initializeObservability({
      serviceName: 'worker-test',
      mode: 'test',
    });
    resetTestExporters(observability);

    const store = {
      loadInputEventTraceForRun: vi.fn().mockResolvedValue({}),
      claimRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        inputEventId: 'evt-1',
        agentName: 'example-echo',
        reactorName: 'handler',
        status: 'running',
        attemptCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      loadEvent: vi.fn().mockResolvedValue({
        id: 'evt-1',
        type: 'example.ping.v1',
        source: 'test',
        externalId: 'ext',
        data: {},
        rootId: 'evt-1',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      renewRunLock: vi.fn(),
      markRunSucceeded: vi.fn(),
      markRunFailed: vi.fn(),
    };

    const registry = createRuntimeRegistry([
      defineRegistryAgent({
        name: 'example-echo',
        reactors: [
          defineReactor({
            name: 'handler',
            subscribesTo: ['example.ping.v1'],
            handler: async () => {},
          }),
        ],
      }),
    ]);

    await executeRun('run-1', {
      store: store as never,
      registry,
      tracer: observability.tracer,
      metrics: observability.metrics,
    });

    const spans = getFinishedSpans(observability);
    const runSpan = spans.find((s) => s.name === 'reactor run');
    expect(runSpan?.attributes['synapse.agent']).toBe('example-echo');
    expect(runSpan?.attributes['synapse.reactor']).toBe('handler');
    expect(runSpan?.attributes['synapse.event.type']).toBe('example.ping.v1');

    const metrics = await getExportedMetrics(observability);
    const agentRunPoints =
      metrics[0]?.scopeMetrics
        .flatMap((s) => s.metrics)
        .find((m) => m.descriptor.name === 'synapse.agent.runs')?.dataPoints ??
      [];
    expect(agentRunPoints.length).toBeGreaterThan(0);

    await observability.shutdown();
  });
});
