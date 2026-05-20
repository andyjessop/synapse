import type { ResolvedPollSource } from 'runtime-manifest';
import type { ObservabilityHandle } from 'runtime-observability';
import type { RuntimePool } from 'runtime-store';

import { runPollSource } from './run-poll-source.js';

export type PollSupervisorSubscription = {
  unsubscribe(): void;
};

export type MountPollSupervisorsInput = {
  sources: ResolvedPollSource[];
  pool: RuntimePool;
  repoRoot: string;
  redisUrl: string;
  observability?: ObservabilityHandle;
  env: NodeJS.ProcessEnv;
  /** When true, run one tick immediately before the interval timer (production default). */
  startImmediately?: boolean;
};

export function mountPollSupervisors(
  input: MountPollSupervisorsInput,
): PollSupervisorSubscription[] {
  const subscriptions: PollSupervisorSubscription[] = [];

  for (const resolved of input.sources) {
    if (!resolved.enabled) {
      continue;
    }

    let stopped = false;
    let running = false;
    let timer: NodeJS.Timeout | undefined;

    const runTick = () => {
      if (stopped) {
        return;
      }
      if (running) {
        input.observability?.metrics.recordPollSkip(
          { source_id: resolved.id, reason: 'in_process_running' },
          1,
        );
        return;
      }
      running = true;
      void runPollSource({
        resolved,
        invocation: 'interval',
        pool: input.pool,
        repoRoot: input.repoRoot,
        redisUrl: input.redisUrl,
        observability: input.observability,
        env: input.env,
      })
        .catch((error) => {
          console.error(
            { error, pollSourceId: resolved.id },
            'poll interval tick crashed',
          );
        })
        .finally(() => {
          running = false;
        });
    };

    if (input.startImmediately === true) {
      runTick();
    }
    timer = setInterval(runTick, resolved.intervalMs);

    subscriptions.push({
      unsubscribe() {
        stopped = true;
        if (timer !== undefined) {
          clearInterval(timer);
          timer = undefined;
        }
      },
    });
  }

  return subscriptions;
}
