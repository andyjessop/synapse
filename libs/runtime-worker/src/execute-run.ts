import type { Tracer } from '@opentelemetry/api';
import type { Pool } from 'pg';
import type { AgentSqliteDb } from 'runtime-agent';
import {
  AgentSqliteRuntimeError,
  getAgentSqliteDb,
} from 'runtime-agent-sqlite';
import { runWithRuntimeSpan } from 'runtime-observability';
import type { RuntimeStore } from 'runtime-store';
import { createAgentContext } from './context';
import type { RuntimeRegistry } from './registry';

/** Postgres crash-recovery lease duration on claim and each renewal. */
export const REACTOR_RUN_LOCK_MS = 120_000;

/** Fixed interval between `renewRunLock` calls while a handler is in flight. */
export const REACTOR_RUN_LOCK_RENEW_INTERVAL_MS = 60_000;

export type ExecuteRunAgentSqliteConfig = {
  baseDir: string;
  lockTimeoutMs: number;
  migrationMaxMsPerMigration: number;
};

function startRunLockRenewal(
  store: RuntimeStore,
  runId: string,
  lockMs: number,
  intervalMs: number,
): () => void {
  const timer = setInterval(() => {
    void store.renewRunLock(runId, lockMs);
  }, intervalMs);
  return () => clearInterval(timer);
}

export async function executeRun(
  runId: string,
  deps: {
    store: RuntimeStore;
    registry: RuntimeRegistry;
    pool?: Pool;
    agentSqlite?: ExecuteRunAgentSqliteConfig;
    lockMs?: number;
    /** Test-only override; production uses {@link REACTOR_RUN_LOCK_RENEW_INTERVAL_MS}. */
    lockRenewIntervalMs?: number;
    tracer?: Tracer;
  },
): Promise<void> {
  if (runId.trim() === '') {
    throw new Error('BullMQ reactor.run job requires a non-empty runId');
  }

  const runSpan = async () => {
    const lockMs = deps.lockMs ?? REACTOR_RUN_LOCK_MS;
    const run = await deps.store.claimRun(runId, lockMs);
    if (!run) {
      // Missing runs or duplicate/stale BullMQ deliveries: nothing to do.
      return;
    }

    const renewIntervalMs =
      deps.lockRenewIntervalMs ?? REACTOR_RUN_LOCK_RENEW_INTERVAL_MS;
    const stopRenewal = startRunLockRenewal(
      deps.store,
      run.id,
      lockMs,
      renewIntervalMs,
    );

    try {
      const event = await deps.store.loadEvent(run.inputEventId);
      const registered = deps.registry.getAgent(run.agentName, run.reactorName);

      let db: AgentSqliteDb | undefined;
      if (registered.agentSqlite !== undefined) {
        if (deps.pool === undefined || deps.agentSqlite === undefined) {
          throw new Error(
            'SQLite-backed agent requires executeRun deps.pool and deps.agentSqlite',
          );
        }
        db = await getAgentSqliteDb({
          pool: deps.pool,
          tracer: deps.tracer,
          agentName: registered.agentName,
          reactorName: registered.reactorName,
          migrations: registered.agentSqlite.migrations,
          baseDir: deps.agentSqlite.baseDir,
          lockTimeoutMs: deps.agentSqlite.lockTimeoutMs,
          migrationMaxMsPerMigration:
            deps.agentSqlite.migrationMaxMsPerMigration,
        });
      }

      const ctx = createAgentContext({
        run,
        event,
        store: deps.store,
        db,
      });
      await registered.handler(ctx, event);
      await deps.store.markRunSucceeded(run.id);
    } catch (error) {
      const failureDetail =
        error instanceof AgentSqliteRuntimeError ? error.detail : undefined;
      await deps.store.markRunFailed(run.id, error, failureDetail);
      throw error;
    } finally {
      stopRenewal();
    }
  };

  if (deps.tracer === undefined) {
    await runSpan();
    return;
  }

  await runWithRuntimeSpan({
    hop: 'reactor.run',
    tracer: deps.tracer,
    queue: 'reactor-runs',
    run: runSpan,
  });
}

export async function executeRunFromJobData(
  data: unknown,
  deps: Parameters<typeof executeRun>[1],
): Promise<void> {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('runId' in data) ||
    typeof data.runId !== 'string' ||
    data.runId.trim() === ''
  ) {
    throw new Error('BullMQ reactor.run job data must be { runId: string }');
  }
  await executeRun(data.runId, deps);
}
