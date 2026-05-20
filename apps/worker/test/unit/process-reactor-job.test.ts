import {
  getFinishedSpans,
  initializeObservability,
  resetTestExporters,
} from 'runtime-observability';
import { describe, expect, it, vi } from 'vitest';
import {
  processReactorJob,
  reactorJobRunId,
} from '../../src/process-reactor-job.js';

vi.mock('runtime-worker', () => ({
  REACTOR_JOB_NAME: 'reactor.run',
  REACTOR_QUEUE_NAME: 'reactor-runs',
  executeRunFromJobData: vi.fn().mockResolvedValue(undefined),
}));

describe('processReactorJob', () => {
  it('extracts run id from job data', () => {
    expect(reactorJobRunId({ runId: 'run-1' })).toBe('run-1');
    expect(reactorJobRunId({})).toBe('');
  });

  it('wraps executeRun in bullmq.process with trace parent from event', async () => {
    const observability = initializeObservability({
      serviceName: 'worker-test',
      mode: 'test',
    });
    resetTestExporters(observability);

    const traceparent =
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const store = {
      loadInputEventTraceForRun: vi.fn().mockResolvedValue({ traceparent }),
    };

    await processReactorJob(
      { id: 'job-1', name: 'reactor.run', data: { runId: 'run-1' } },
      {
        store: store as never,
        observability,
        executeDeps: { store: store as never, registry: {} as never },
      },
    );

    const spans = getFinishedSpans(observability);
    expect(spans.some((s) => s.name === 'bullmq process')).toBe(true);
    expect(store.loadInputEventTraceForRun).toHaveBeenCalledWith('run-1');

    await observability.shutdown();
  });

  it('rejects unexpected job names', async () => {
    const observability = initializeObservability({
      serviceName: 'worker-test',
      mode: 'test',
    });
    await expect(
      processReactorJob(
        { id: 'job-1', name: 'other', data: { runId: 'run-1' } },
        {
          store: { loadInputEventTraceForRun: vi.fn() } as never,
          observability,
          executeDeps: { store: {} as never, registry: {} as never },
        },
      ),
    ).rejects.toThrow(/Unexpected BullMQ job name/);
    await observability.shutdown();
  });
});
