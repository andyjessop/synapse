import { join } from 'node:path';

import {
  assertDevWipeAllowed,
  createRootGraphObserver,
  findLatestDevRunSnapshotRelativePath,
  resolveDevOnceManifestPath,
  resolveRootGraphWaitPollParams,
  retryDevFailedRunsOnRoot,
  waitForLatestDevRunSnapshotRelativePath,
  wipeDevRuntime,
} from 'dev-cli-shared';
import {
  deleteScenarioRun,
  installScenarioRun,
  parseAdaptersBaseUrl,
} from 'runtime-adapters';
import { loadDotEnvLocal, parseRuntimeConfig } from 'runtime-config';
import {
  assertScenarioAdaptersMounted,
  parseRuntimeManifestFile,
} from 'runtime-manifest';
import { createRuntimeStorePool, selectEventById } from 'runtime-store';
import {
  resolveScenarioById,
  resolveScenarioIngressSource,
} from 'synapse-scenarios';

import {
  clearActiveScenarioRun,
  clearStaleActiveScenarioRun,
  writeActiveScenarioRun,
} from './active-scenario-run.js';
import type { SynapseRunArtifact } from './artifact-schema.js';
import { buildSynapseRunArtifact } from './build-artifact.js';
import {
  resolveScenarioAdaptersForInstall,
  scenarioAdapterSources,
} from './resolve-scenario-adapters.js';
import {
  resolveScenarioIngressBaseUrl,
  runScenarioPollTick,
  runScenarioWebhookStep,
} from './scenario-ingress.js';
import { waitForScenarioTerminal } from './scenario-terminal.js';

export type RunDevOnceOptions = {
  repoRoot: string;
  /** Scenario id (`--scenario` / `--fixture` CLI flags). */
  scenarioId: string;
  scenarioFilePath?: string;
  /** Truncate local Postgres runtime tables and drain the reactor queue before ingress. */
  clean?: boolean;
  /** Manifest path override (`--manifest` on dev:once). Defaults to `manifests/application.json`. */
  manifestPath?: string;
  timeoutMs?: number;
  pollMs?: number;
  noWait?: boolean;
  liveGraph?: boolean;
  onLiveGraphLine?: (line: string) => void;
  env?: Record<string, string | undefined>;
};

function resolvePollParams(options: RunDevOnceOptions): {
  pollMs: number;
  timeoutMs: number | undefined;
} {
  const env = options.env ?? process.env;
  const defaults = resolveRootGraphWaitPollParams(env);
  return {
    pollMs: options.pollMs ?? defaults.pollMs,
    timeoutMs: options.timeoutMs ?? defaults.maxMs,
  };
}

function loadManifestForDevOnce(
  repoRoot: string,
  manifestPathOverride?: string,
) {
  const manifestPath = resolveDevOnceManifestPath(
    repoRoot,
    manifestPathOverride,
  );
  const manifest = parseRuntimeManifestFile(manifestPath);
  return {
    manifestPath,
    manifestName: manifest.name,
    manifest,
  };
}

async function graphHasTerminalType(
  pool: Awaited<ReturnType<typeof createRuntimeStorePool>>,
  rootId: string,
  terminalEventTypes: readonly string[],
): Promise<boolean> {
  const result = await pool.query(
    `select 1 from events where root_id = $1 and type = any($2::text[]) limit 1`,
    [rootId, [...terminalEventTypes]],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function runDevOnce(
  options: RunDevOnceOptions,
): Promise<SynapseRunArtifact> {
  const env = loadDotEnvLocal(
    join(options.repoRoot, '.env.local'),
    options.env ?? process.env,
  );
  const config = parseRuntimeConfig(env);
  const pgSchema = env.SYNAPSE_PG_SCHEMA?.trim();
  const pool = createRuntimeStorePool({
    databaseUrl: config.databaseUrl,
    max: 4,
    ...(pgSchema !== undefined && pgSchema !== '' ? { schema: pgSchema } : {}),
  });

  if (options.clean === true) {
    assertDevWipeAllowed(config.databaseUrl);
    const { clearedActive } = clearStaleActiveScenarioRun(options.repoRoot);
    if (clearedActive !== undefined) {
      try {
        await deleteScenarioRun(
          parseAdaptersBaseUrl(env),
          clearedActive.scenarioRunId,
        );
      } catch (error) {
        console.warn(
          `Failed to delete stale adapter scenario run ${clearedActive.scenarioRunId}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    await wipeDevRuntime({ pool, redisUrl: config.redisUrl });
  }

  try {
    const { manifestPath, manifestName, manifest } = loadManifestForDevOnce(
      options.repoRoot,
      options.manifestPath,
    );
    const { scenario, scenarioFilePath } = resolveScenarioById(
      options.repoRoot,
      manifest,
      options.scenarioId,
    );

    const adapterSources = scenarioAdapterSources(scenario);
    if (adapterSources.length > 0) {
      assertScenarioAdaptersMounted(manifest, scenario.id, adapterSources);
    }

    let scenarioRunId: string | undefined;
    const adaptersBase = parseAdaptersBaseUrl(env);

    if ((scenario.adapters ?? []).length > 0) {
      const resolvedAdapters = resolveScenarioAdaptersForInstall(
        options.repoRoot,
        scenario.adapters ?? [],
      );
      const installed = await installScenarioRun(adaptersBase, {
        scenarioId: scenario.id,
        adapters: resolvedAdapters,
      });
      scenarioRunId = installed.scenarioRunId;
      writeActiveScenarioRun(options.repoRoot, {
        scenarioRunId,
        scenarioId: scenario.id,
      });
    }

    try {
      const resolved = resolveScenarioIngressSource(
        scenario.ingress.source,
        manifest,
        manifest.name,
      );
      const { pollMs, timeoutMs } = resolvePollParams(options);
      const ingressBase = resolveScenarioIngressBaseUrl(env);
      const terminalTypes = scenario.terminalEventTypes;
      const fixtures = scenario.ingress.fixtures;

      let inputEventId: string | undefined;

      if (resolved.kind === 'webhook') {
        for (let index = 0; index < fixtures.length; index += 1) {
          const fixture = fixtures[index]!;
          const stepResult = await runScenarioWebhookStep({
            repoRoot: options.repoRoot,
            ingressBase,
            scenario,
            resolved,
            fixture,
            scenarioRunId,
          });
          inputEventId = stepResult.inputEventId;

          const isLast = index === fixtures.length - 1;
          const shouldWaitBetweenSteps =
            !options.noWait &&
            terminalTypes !== undefined &&
            terminalTypes.length > 0 &&
            !isLast;

          if (shouldWaitBetweenSteps) {
            const stepEvent = await selectEventById(pool, inputEventId);
            if (stepEvent === undefined) {
              throw new Error(
                `No durable event for webhook step ${inputEventId}`,
              );
            }
            const stepTerminal = await waitForScenarioTerminal({
              pool,
              rootId: stepEvent.rootId,
              terminalEventTypes: terminalTypes,
              pollMs,
              timeoutMs,
            });
            if (stepTerminal.kind !== 'succeeded') {
              return await buildSynapseRunArtifact({
                pool,
                manifestName,
                manifestPath,
                scenario,
                scenarioFilePath: options.scenarioFilePath ?? scenarioFilePath,
                inputEvent: stepEvent,
                terminal: stepTerminal,
                env,
              });
            }
          }
        }
      } else {
        for (let index = 0; index < fixtures.length; index += 1) {
          const fixture = fixtures[index]!;
          const tickResult = await runScenarioPollTick({
            repoRoot: options.repoRoot,
            ingressBase,
            scenario,
            resolved,
            fixture,
            scenarioRunId,
          });
          if (tickResult === undefined) {
            continue;
          }
          inputEventId = tickResult.inputEventId;

          if (
            !options.noWait &&
            terminalTypes !== undefined &&
            terminalTypes.length > 0
          ) {
            const tickEvent = await selectEventById(pool, inputEventId);
            if (tickEvent === undefined) {
              throw new Error(`No durable event for poll tick ${inputEventId}`);
            }
            const reached = await graphHasTerminalType(
              pool,
              tickEvent.rootId,
              terminalTypes,
            );
            if (reached) {
              break;
            }
          }
        }
        if (inputEventId === undefined) {
          throw new Error(
            `Poll scenario ${scenario.id} produced no root events from ${fixtures.length} fixture(s)`,
          );
        }
      }

      if (inputEventId === undefined) {
        throw new Error(`Scenario ${scenario.id} produced no root event`);
      }

      const event = await selectEventById(pool, inputEventId);
      if (event === undefined) {
        throw new Error(`No durable event for scenario root ${inputEventId}`);
      }

      await retryDevFailedRunsOnRoot({
        pool,
        redisUrl: config.redisUrl,
        rootId: event.rootId,
      });

      const useLiveGraph =
        options.liveGraph === true &&
        !options.noWait &&
        options.onLiveGraphLine !== undefined;
      const liveObserver = useLiveGraph ? createRootGraphObserver() : undefined;

      const terminal = options.noWait
        ? ({ kind: 'succeeded' } as const)
        : await waitForScenarioTerminal({
            pool,
            rootId: event.rootId,
            terminalEventTypes: terminalTypes,
            pollMs,
            timeoutMs,
            onPollTick:
              liveObserver === undefined
                ? undefined
                : async () => {
                    const lines = await liveObserver.poll(pool, event.rootId);
                    for (const line of lines) {
                      options.onLiveGraphLine?.(line);
                    }
                  },
          });

      const graphSnapshotPath =
        resolved.kind === 'poll'
          ? findLatestDevRunSnapshotRelativePath(options.repoRoot, inputEventId)
          : options.noWait
            ? findLatestDevRunSnapshotRelativePath(
                options.repoRoot,
                inputEventId,
              )
            : await waitForLatestDevRunSnapshotRelativePath(
                options.repoRoot,
                inputEventId,
                { pollMs: 500, maxPolls: 60 },
              );

      return await buildSynapseRunArtifact({
        pool,
        manifestName,
        manifestPath,
        scenario,
        scenarioFilePath: options.scenarioFilePath ?? scenarioFilePath,
        inputEvent: event,
        terminal,
        graphSnapshotPath: graphSnapshotPath ?? undefined,
        env,
      });
    } finally {
      if (scenarioRunId !== undefined) {
        try {
          await deleteScenarioRun(adaptersBase, scenarioRunId);
        } catch (error) {
          console.warn(
            `Failed to delete adapter scenario run ${scenarioRunId}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
        clearActiveScenarioRun(options.repoRoot);
      }
    }
  } finally {
    await pool.end();
  }
}
