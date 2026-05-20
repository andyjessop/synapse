import {
  type ObservabilityHandle,
  runWithRuntimeSpan,
} from 'runtime-observability';

export async function runAdapterRequestSpan<T>(input: {
  observability: ObservabilityHandle;
  source: string;
  method: string;
  mode: 'live' | 'scenario';
  scenarioRunId?: string;
  run: () => Promise<T>;
}): Promise<T> {
  try {
    const result = await runWithRuntimeSpan({
      tracer: input.observability.tracer,
      hop: 'adapter.request',
      adapter: input.source,
      operation: input.method,
      options: {
        attributes: {
          'synapse.adapter.source': input.source,
          'synapse.adapter.method': input.method,
          'synapse.adapter.mode': input.mode,
          ...(input.scenarioRunId !== undefined
            ? { 'synapse.scenario.run_id': input.scenarioRunId }
            : {}),
        },
      },
      run: async () => input.run(),
    });
    input.observability.metrics.recordAdapter({
      adapter: input.source,
      operation: input.method,
      result: 'success',
    });
    return result;
  } catch (error) {
    input.observability.metrics.recordAdapter({
      adapter: input.source,
      operation: input.method,
      result: 'failure',
    });
    throw error;
  }
}
