import type { Queue } from 'bullmq';
import type { RuntimeStore } from 'runtime-store';
import type { RuntimeRegistry } from './registry';

export const REACTOR_QUEUE_NAME = 'reactor-runs';
export const REACTOR_JOB_NAME = 'reactor.run';

const REACTOR_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: true,
  /** Durable failure is `agent_runs` (Postgres); do not retain failed jobs by id. */
  removeOnFail: true,
} as const;

/** Clears a terminal BullMQ job so `queue.add` with the same `jobId` can run again. */
export async function clearTerminalReactorJobIfPresent(
  queue: Pick<Queue, 'getJob'>,
  runId: string,
): Promise<'absent' | 'cleared' | 'in_flight'> {
  const existing = await queue.getJob(runId);
  if (existing === undefined) {
    return 'absent';
  }
  const state = await existing.getState();
  if (state === 'failed' || state === 'completed') {
    await existing.remove();
    return 'cleared';
  }
  return 'in_flight';
}

export type RuntimeLogger = {
  error(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
};

export type StreamSubscription = {
  unsubscribe(): void;
};

export function startPlanningStream(input: {
  store: RuntimeStore;
  registry: RuntimeRegistry;
  logger: RuntimeLogger;
  intervalMs?: number;
  concurrency?: number;
}): StreamSubscription {
  return startIntervalSupervisor({
    intervalMs: input.intervalMs ?? 1_000,
    logger: input.logger,
    errorMessage: 'planning stream crashed',
    tick: async () => {
      const events = await input.store.loadEventsForPlanning(100);
      await mapWithConcurrency(
        events,
        input.concurrency ?? 4,
        async (event) => {
          const agents = input.registry.findAgentsForEvent(event.type);
          for (const agent of agents) {
            await input.store.ensureAgentRun({
              inputEventId: event.id,
              agentName: agent.agentName,
              reactorName: agent.reactorName,
            });
          }
        },
      );
    },
  });
}

export function startQueueingStream(input: {
  store: RuntimeStore;
  queue: Pick<Queue, 'add' | 'getJob'>;
  logger: RuntimeLogger;
  intervalMs?: number;
  concurrency?: number;
}): StreamSubscription {
  return startIntervalSupervisor({
    intervalMs: input.intervalMs ?? 1_000,
    logger: input.logger,
    errorMessage: 'queueing stream crashed',
    tick: async () => {
      const runs = await input.store.loadPendingRuns(100);
      await mapWithConcurrency(runs, input.concurrency ?? 8, async (run) => {
        try {
          const terminal = await clearTerminalReactorJobIfPresent(
            input.queue,
            run.id,
          );
          if (terminal === 'in_flight') {
            await input.store.markRunQueued(run.id);
            return;
          }
          await input.queue.add(
            REACTOR_JOB_NAME,
            { runId: run.id },
            {
              jobId: run.id,
              ...REACTOR_JOB_OPTIONS,
            },
          );
          await input.store.markRunQueued(run.id);
        } catch (error) {
          input.logger.warn(
            { error, runId: run.id },
            'failed to queue reactor run',
          );
        }
      });
    },
  });
}

export function startRepairStream(input: {
  store: RuntimeStore;
  logger: RuntimeLogger;
  intervalMs?: number;
}): StreamSubscription {
  return startIntervalSupervisor({
    intervalMs: input.intervalMs ?? 30_000,
    logger: input.logger,
    errorMessage: 'repair stream crashed',
    tick: () => input.store.repairStaleRuns(),
  });
}

function startIntervalSupervisor(input: {
  intervalMs: number;
  logger: RuntimeLogger;
  errorMessage: string;
  tick: () => Promise<void>;
}): StreamSubscription {
  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | undefined;

  const runTick = () => {
    if (stopped || running) {
      return;
    }
    running = true;
    void input
      .tick()
      .catch((error) => {
        input.logger.error({ error }, input.errorMessage);
      })
      .finally(() => {
        running = false;
      });
  };

  runTick();
  timer = setInterval(runTick, input.intervalMs);

  return {
    unsubscribe() {
      stopped = true;
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<void>,
): Promise<void> {
  const workerCount = Math.max(1, Math.min(concurrency, values.length));
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const value = values[nextIndex]!;
        nextIndex += 1;
        await mapper(value);
      }
    }),
  );
}
