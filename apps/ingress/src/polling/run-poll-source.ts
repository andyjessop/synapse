import type { Tracer } from '@opentelemetry/api';
import type {
  PollSourceId,
  ResolvedPollSource,
  ScenarioFixtureContext,
} from 'runtime-manifest';
import {
  buildRuntimeLogFields,
  type ObservabilityHandle,
  runWithRuntimeSpan,
} from 'runtime-observability';
import type { RuntimePool } from 'runtime-store';

import { createScenarioAdapterConsumptionState } from '../scenario/scenario-adapter-match.js';
import {
  POLL_SOURCE_REGISTRARS,
  type PollRunError,
  type PollRunInvocation,
  type PollRunOutcome,
  type PollTickSummary,
  toPollRunError,
} from './poll-source-registry.js';
import {
  acquirePollLock,
  createPollLockClient,
  type PollLockClient,
  releasePollLock,
} from './redis-poll-lock.js';

export type RunPollSourceInput = {
  resolved: ResolvedPollSource;
  invocation: PollRunInvocation;
  pool: RuntimePool;
  repoRoot: string;
  redisUrl: string;
  observability?: ObservabilityHandle;
  env: NodeJS.ProcessEnv;
  scenarioFixtureContext?: ScenarioFixtureContext;
  /** Non-scenario manual candidates passed on tick (debug only). */
  candidates?: unknown[];
};

function lockHeldSummary(
  resolved: ResolvedPollSource,
  durationMs: number,
): PollTickSummary {
  return {
    sourceId: resolved.id,
    emitted: 0,
    skipped: 0,
    failed: 0,
    durationMs,
    rootEventIds: [],
    skipReasons: { lock_held: 1 },
  };
}

function recordPollSummaryMetrics(
  observability: ObservabilityHandle | undefined,
  sourceId: PollSourceId,
  summary: PollTickSummary,
): void {
  if (observability === undefined) {
    return;
  }
  if (summary.emitted > 0) {
    observability.metrics.recordPollEmit(
      { source_id: sourceId },
      summary.emitted,
    );
  }
  for (const [reason, count] of Object.entries(summary.skipReasons ?? {})) {
    observability.metrics.recordPollSkip(
      { source_id: sourceId, reason },
      count,
    );
  }
}

function buildRegistrarDeps(
  input: RunPollSourceInput,
): Parameters<(typeof POLL_SOURCE_REGISTRARS)[PollSourceId]>[0] {
  const scenarioAdapterState =
    input.scenarioFixtureContext !== undefined
      ? createScenarioAdapterConsumptionState(input.scenarioFixtureContext)
      : undefined;

  return {
    pool: input.pool,
    repoRoot: input.repoRoot,
    redisUrl: input.redisUrl,
    observability: input.observability,
    resolved: input.resolved,
    env: input.env,
    invocation: input.invocation,
    candidates: input.candidates,
    scenarioAdapterState,
    scenarioFixtureContext: input.scenarioFixtureContext,
  };
}

async function invokeRegistrar(
  input: RunPollSourceInput,
  started: number,
): Promise<PollRunOutcome> {
  const registrar = POLL_SOURCE_REGISTRARS[input.resolved.id];
  try {
    const result = await registrar(buildRegistrarDeps(input));
    const summary: PollTickSummary = {
      sourceId: input.resolved.id,
      emitted: result.emitted,
      skipped: result.skipped,
      failed: result.failed,
      durationMs: Date.now() - started,
      rootEventIds: result.rootEventIds,
      skipReasons: result.skipReasons,
      failureReasons: result.failureReasons,
    };
    input.observability?.metrics.recordPollTick({
      source_id: input.resolved.id,
      outcome: 'success',
    });
    recordPollSummaryMetrics(input.observability, input.resolved.id, summary);
    return { ok: true, summary };
  } catch (error) {
    input.observability?.metrics.recordPollTick({
      source_id: input.resolved.id,
      outcome: 'error',
    });
    const pollError = toPollRunError(error);
    console.error(
      buildRuntimeLogFields({ source: `poll:${input.resolved.id}` }),
      `poll tick failed (${input.invocation}): ${pollError.message}`,
    );
    return {
      ok: false,
      sourceId: input.resolved.id,
      error: pollError,
      durationMs: Date.now() - started,
    };
  }
}

async function withOptionalPollSpan<T>(
  tracer: Tracer | undefined,
  input: {
    hop: 'poll.tick' | 'poll.lock';
    pollSourceId: PollSourceId;
    operation: string;
  },
  run: () => Promise<T>,
): Promise<T> {
  if (tracer === undefined) {
    return run();
  }
  return runWithRuntimeSpan({
    hop: input.hop,
    tracer,
    pollSourceId: input.pollSourceId,
    operation: input.operation,
    run: async () => run(),
  });
}

async function disconnectPollLockClient(redis: PollLockClient): Promise<void> {
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}

export async function runPollSource(
  input: RunPollSourceInput,
  lockClient?: PollLockClient,
): Promise<PollRunOutcome> {
  const started = Date.now();
  const tracer = input.observability?.tracer;
  const sourceId = input.resolved.id;

  return withOptionalPollSpan(
    tracer,
    {
      hop: 'poll.tick',
      pollSourceId: sourceId,
      operation: input.invocation,
    },
    async () => {
      const redis = lockClient ?? createPollLockClient(input.redisUrl);
      const ownsClient = lockClient === undefined;
      let token: string | undefined;

      try {
        token = await withOptionalPollSpan(
          tracer,
          {
            hop: 'poll.lock',
            pollSourceId: sourceId,
            operation: 'acquire',
          },
          async () =>
            acquirePollLock(
              redis,
              input.resolved.lockKey,
              input.resolved.lockTtlMs,
            ),
        );

        if (token === undefined) {
          const summary = lockHeldSummary(input.resolved, Date.now() - started);
          input.observability?.metrics.recordPollTick({
            source_id: sourceId,
            outcome: 'lock_held',
          });
          recordPollSummaryMetrics(input.observability, sourceId, summary);
          return { ok: true, summary };
        }

        return await invokeRegistrar(input, started);
      } finally {
        if (token !== undefined) {
          await withOptionalPollSpan(
            tracer,
            {
              hop: 'poll.lock',
              pollSourceId: sourceId,
              operation: 'release',
            },
            async () => releasePollLock(redis, input.resolved.lockKey, token!),
          );
        }
        if (ownsClient) {
          await disconnectPollLockClient(redis);
        }
      }
    },
  );
}
