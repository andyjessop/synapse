import { join } from 'node:path';
import type { AgentDefinition, RegistryAgentDefinition } from 'runtime-agent';
import { closeAllAgentSqliteHandles } from 'runtime-agent-sqlite';
import { getRepoRoot } from 'runtime-config';
import {
  loadValidatedManifestRegistry,
  resolveManifestPath,
} from 'runtime-manifest';
import type { RuntimePool, RuntimeStore } from 'runtime-store';
import { wrapManifestRuntimeRegistry } from 'runtime-worker';
import { validateScenarioForManifest } from 'synapse-scenarios';
import {
  bootstrapTestWorker,
  probeIntegrationInfra,
  type TestWorkerHandle,
  waitForEventType,
  waitForRunStatus,
  withIsolatedStreamsStore,
} from '../../runtime-worker/test/integration/harness.js';

export type { RunDevOnceOptions } from 'dev-once';
export { runDevOnce } from 'dev-once';
export {
  assertNoDuplicateEvents,
  assertNoDuplicateRuns,
  bootstrapTestWorker,
  countRows,
  delay,
  emitFixtureEvent,
  pollUntil,
  probeIntegrationInfra,
  resetRedis,
  type StreamsTestContext,
  type TestWorkerHandle,
  waitForEventType,
  waitForRunStatus,
  withIsolatedStreamsStore,
} from '../../runtime-worker/test/integration/harness.js';
export type {
  StartTestDevServerInput,
  TestDevServerHandle,
} from './start-test-dev-server.js';
export {
  startTestDevServer,
  withTestDevServer,
} from './start-test-dev-server.js';

export const integrationInfraAvailable = await probeIntegrationInfra();

export type AgentE2eContext = {
  pool: RuntimePool;
  store: RuntimeStore;
  repoRoot: string;
  worker: TestWorkerHandle;
  /** Resolve a repo-root-relative path (e.g. `fixtures/agent-reviewer/foo.json`). */
  fixturePath: (repoRelativePath: string) => string;
};

type RunAgentE2eBase = {
  run: (ctx: AgentE2eContext) => Promise<void>;
  /** When set, the worker runs `executeRun` with SQLite (same as production worker). */
  agentSqlite?: {
    baseDir: string;
    lockTimeoutMs?: number;
    migrationMaxMsPerMigration?: number;
  };
};

export type RunAgentE2eManifestInput = RunAgentE2eBase & {
  manifestPath: string;
  shippedAgents: ReadonlyMap<string, AgentDefinition>;
  knownEventTypes: ReadonlySet<string>;
  createAgents?: never;
};

export type RunAgentE2eLegacyInput = RunAgentE2eBase & {
  manifestPath?: undefined;
  /** Build legacy agent definitions when not using `manifestPath`. */
  createAgents?: (ctx: { repoRoot: string }) => RegistryAgentDefinition[];
  shippedAgents?: never;
  knownEventTypes?: never;
};

export type RunAgentE2eInput =
  | RunAgentE2eManifestInput
  | RunAgentE2eLegacyInput;

/**
 * Spins up an isolated Postgres schema, Redis, and runtime worker with the given
 * agents — same execution path as production worker.
 */
export async function runAgentE2e(input: RunAgentE2eInput): Promise<void> {
  await withIsolatedStreamsStore(async ({ pool, store, redisUrl }) => {
    const repoRoot = getRepoRoot(import.meta.url);
    let registry;
    if (input.manifestPath !== undefined) {
      const absManifest = resolveManifestPath(
        repoRoot,
        process.env,
        input.manifestPath,
      );
      const loaded = await loadValidatedManifestRegistry({
        repoRoot,
        manifestPath: absManifest,
        shippedAgents: input.shippedAgents,
        knownEventTypes: input.knownEventTypes,
        env: process.env,
        validateScenarioForManifest,
      });
      registry = wrapManifestRuntimeRegistry(loaded.registry);
    }
    const worker = await bootstrapTestWorker({
      pool,
      store,
      redisUrl,
      agents:
        input.manifestPath === undefined
          ? (input.createAgents?.({ repoRoot }) ?? [])
          : undefined,
      registry,
      agentSqlite: input.agentSqlite,
    });
    try {
      await input.run({
        pool,
        store,
        repoRoot,
        worker,
        fixturePath: (repoRelativePath) => join(repoRoot, repoRelativePath),
      });
    } finally {
      await worker.shutdown();
      if (input.agentSqlite !== undefined) {
        closeAllAgentSqliteHandles();
      }
    }
  });
}

export async function expectAgentRunSucceeded(
  pool: RuntimePool,
  input: {
    agentName: string;
    reactorName: string;
    inputEventId: string;
    timeoutMs?: number;
  },
): Promise<string> {
  return waitForRunStatus(pool, {
    agentName: input.agentName,
    reactorName: input.reactorName,
    inputEventId: input.inputEventId,
    status: 'succeeded',
  });
}

export async function expectEventType(
  pool: RuntimePool,
  type: string,
  options?: { rootId?: string },
) {
  return waitForEventType(pool, type, options);
}
