import type {
  PollSourceId,
  ResolvedPollSource,
  ScenarioFixtureContext,
} from 'runtime-manifest';
import type { ObservabilityHandle } from 'runtime-observability';
import type { RuntimePool } from 'runtime-store';
import type { PollIngressResult, PollTickReasonCounts } from 'runtime-worker';

import type { ScenarioAdapterConsumptionState } from '../scenario/scenario-adapter-match.js';
import type { PollRunError, PollTickSummary } from './poll-http-schemas.js';
import { exampleInMemoryHeartbeatRegistrar } from './registrars/example-in-memory-heartbeat.js';

export type { PollTickReasonCounts } from 'runtime-worker';
export type { PollRunError, PollTickSummary } from './poll-http-schemas.js';

/** Infrastructure-only label for logs/metrics; does not affect agent poll ingress. */
export type PollRunInvocation = 'interval' | 'manual-http';

export type PollRunOutcome =
  | { ok: true; summary: PollTickSummary }
  | {
      ok: false;
      sourceId: PollSourceId;
      error: PollRunError;
      durationMs: number;
    };

export type PollRegistrarDeps = {
  pool: RuntimePool;
  repoRoot: string;
  redisUrl: string;
  observability?: ObservabilityHandle;
  resolved: ResolvedPollSource;
  env: NodeJS.ProcessEnv;
  invocation: PollRunInvocation;
  /** Manual tick candidates (non-scenario debugging). */
  candidates?: unknown[];
  /** One consumption state per tick when scenario fixtures apply. */
  scenarioAdapterState?: ScenarioAdapterConsumptionState;
  /** Retained for request-scoped webhook ALS; poll registrars use scenarioAdapterState. */
  scenarioFixtureContext?: ScenarioFixtureContext;
};

export type PollRegistrarResult = PollIngressResult;

export type PollRegistrar = (
  deps: PollRegistrarDeps,
) => Promise<PollRegistrarResult>;

export const POLL_SOURCE_REGISTRARS = {
  'synapse.poll.example-in-memory-heartbeat.v1':
    exampleInMemoryHeartbeatRegistrar,
} satisfies Record<PollSourceId, PollRegistrar>;

export function toPollRunError(error: unknown): PollRunError {
  if (error instanceof Error) {
    return { code: 'tick_error', message: error.message };
  }
  return { code: 'tick_error', message: String(error) };
}
