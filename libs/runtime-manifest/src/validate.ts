import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type AgentHandler } from 'runtime-agent';
import {
  assertRepoRelativeFixturePath,
  collectAgentWebhookFixturePaths,
  validateManifestFixtureEntries,
} from 'synapse-fixtures';

import {
  assertHandlerPathAllowlisted,
  resolveHandlerAbsolutePath,
  warnIfManifestOutsideRepo,
} from './handler-path.js';
import {
  collectAgentAdapterFixturePaths,
  loadAdapterFixtureFile,
} from './load-adapter-fixtures.js';
import type { RuntimeManifest } from './manifest-schema.js';

export const MANIFEST_HANDLER_REACTOR_NAME = 'handler' as const;

export const AGENT_REVIEWER_MANIFEST_AGENT_NAME = 'agent-reviewer' as const;

export type ValidatedRuntimeManifest = RuntimeManifest & {
  manifestPath: string;
};

export function validateManifestAdapterFixtureEntries(
  manifest: RuntimeManifest,
  deps: { repoRoot: string },
): void {
  for (const agent of manifest.agents) {
    if (agent.name === AGENT_REVIEWER_MANIFEST_AGENT_NAME) {
      const adapterPaths = collectAgentAdapterFixturePaths(agent);
      if (adapterPaths.length === 0) {
        throw new Error(
          `Manifest agent ${AGENT_REVIEWER_MANIFEST_AGENT_NAME} requires fixtures.adapter with at least one adapter fixture path`,
        );
      }
    }

    for (const path of collectAgentAdapterFixturePaths(agent)) {
      assertRepoRelativeFixturePath(path);
      const abs = join(deps.repoRoot, path);
      if (!existsSync(abs)) {
        throw new Error(
          `Adapter fixture file not found for ${agent.name}: ${path}`,
        );
      }
      loadAdapterFixtureFile(deps.repoRoot, path);
    }
  }
}

export function validateRuntimeManifest(
  manifest: RuntimeManifest,
  deps: {
    manifestPath: string;
    repoRoot: string;
    knownEventTypes: ReadonlySet<string>;
    resolveHandler: (handlerPath: string) => AgentHandler;
  },
): ValidatedRuntimeManifest {
  const outsideWarning = warnIfManifestOutsideRepo(
    deps.repoRoot,
    deps.manifestPath,
  );
  if (outsideWarning !== undefined) {
    console.warn(outsideWarning);
  }

  const agentNames = new Set<string>();
  for (const agent of manifest.agents) {
    if (agentNames.has(agent.name)) {
      throw new Error(`Duplicate manifest agent name: ${agent.name}`);
    }
    agentNames.add(agent.name);

    for (const eventType of agent.handles) {
      if (!deps.knownEventTypes.has(eventType)) {
        throw new Error(
          `Unknown event type in manifest handles for ${agent.name}: ${eventType}`,
        );
      }
    }

    assertHandlerPathAllowlisted(agent.handler);
    const absHandler = resolveHandlerAbsolutePath(deps.repoRoot, agent.handler);
    if (!existsSync(absHandler)) {
      throw new Error(`Manifest handler file not found: ${agent.handler}`);
    }
    deps.resolveHandler(agent.handler);

    for (const path of collectAgentWebhookFixturePaths(agent, deps.repoRoot)) {
      assertRepoRelativeFixturePath(path);
    }
    for (const path of collectAgentAdapterFixturePaths(agent)) {
      assertRepoRelativeFixturePath(path);
    }
  }

  validateManifestFixtureEntries(manifest, {
    repoRoot: deps.repoRoot,
    knownEventTypes: deps.knownEventTypes,
  });

  validateManifestAdapterFixtureEntries(manifest, { repoRoot: deps.repoRoot });

  return { ...manifest, manifestPath: deps.manifestPath };
}
