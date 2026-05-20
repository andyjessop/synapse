import type { Context } from '@opentelemetry/api';
import type { Job } from 'bullmq';
import {
  contextFromEvent,
  type ObservabilityHandle,
  runWithRuntimeSpan,
} from 'runtime-observability';
import type { RuntimeStore } from 'runtime-store';
import {
  type ExecuteRunDeps,
  executeRunFromJobData,
  REACTOR_JOB_NAME,
  REACTOR_QUEUE_NAME,
} from 'runtime-worker';

export type ProcessReactorJobDeps = {
  store: RuntimeStore;
  observability: ObservabilityHandle;
  executeDeps: Omit<ExecuteRunDeps, 'tracer' | 'metrics' | 'parentContext'>;
};

export function reactorJobRunId(data: unknown): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'runId' in data &&
    typeof data.runId === 'string'
  ) {
    return data.runId;
  }
  return '';
}

export async function processReactorJob(
  job: Pick<Job, 'id' | 'name' | 'data'>,
  deps: ProcessReactorJobDeps,
): Promise<void> {
  if (job.name !== REACTOR_JOB_NAME) {
    throw new Error(`Unexpected BullMQ job name: ${job.name}`);
  }

  const runId = reactorJobRunId(job.data);
  const traceCarrier =
    runId !== '' ? await deps.store.loadInputEventTraceForRun(runId) : {};
  const parentContext: Context | undefined =
    traceCarrier.traceparent !== undefined
      ? contextFromEvent(traceCarrier)
      : undefined;

  await runWithRuntimeSpan({
    hop: 'bullmq.process',
    tracer: deps.observability.tracer,
    queue: REACTOR_QUEUE_NAME,
    jobId: job.id,
    parentContext,
    run: async () => {
      await executeRunFromJobData(job.data, {
        ...deps.executeDeps,
        tracer: deps.observability.tracer,
        metrics: deps.observability.metrics,
        parentContext,
      });
      deps.observability.metrics.recordBullmq({
        queue: REACTOR_QUEUE_NAME,
        operation: 'process',
        result: 'success',
      });
    },
  });
}
