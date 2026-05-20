import { isAbsolute, resolve } from 'node:path';

import { type AgentDefinition, type AgentHandler } from 'runtime-agent';

import { parseRuntimeManifestFile } from './parse.js';
import type { ManifestRuntimeRegistry } from './registry.js';
import { createRuntimeRegistryFromManifest } from './registry.js';
import {
  type ValidatedRuntimeManifest,
  validateRuntimeManifest,
} from './validate.js';

export const DEFAULT_MANIFEST_PATH = 'manifests/application.json' as const;

export function resolveManifestPath(
  repoRoot: string,
  env: Record<string, string | undefined> = process.env,
  cliManifest?: string,
): string {
  const raw =
    cliManifest ?? env.SYNAPSE_RUNTIME_MANIFEST ?? DEFAULT_MANIFEST_PATH;
  return isAbsolute(raw) ? raw : resolve(repoRoot, raw);
}

export async function loadValidatedManifestRegistry(input: {
  repoRoot: string;
  manifestPath: string;
  shippedAgents: ReadonlyMap<string, AgentDefinition>;
  knownEventTypes: ReadonlySet<string>;
  env?: Record<string, string | undefined>;
  agentSqliteByAgent?: ReadonlyMap<
    string,
    import('runtime-agent').AgentSqliteDefinition
  >;
  validateScenarioForManifest?: (
    scenario: import('./scenario-schema.js').Scenario,
    manifest: import('./manifest-schema.js').RuntimeManifest,
  ) => void;
}): Promise<{
  manifest: ValidatedRuntimeManifest;
  registry: ManifestRuntimeRegistry;
  handlers: Map<string, AgentHandler>;
}> {
  const manifest = parseRuntimeManifestFile(input.manifestPath);
  const handlers = new Map<string, AgentHandler>();

  for (const entry of manifest.agents) {
    const def = input.shippedAgents.get(entry.name);
    if (def === undefined) {
      throw new Error(
        `Manifest mounts unknown agent: ${entry.name}. Register it in the worker shipped agent list.`,
      );
    }
    handlers.set(entry.name, def.run);
  }

  const validated = validateRuntimeManifest(manifest, {
    manifestPath: input.manifestPath,
    repoRoot: input.repoRoot,
    knownEventTypes: input.knownEventTypes,
    shippedAgents: input.shippedAgents,
    validateScenarioForManifest: input.validateScenarioForManifest,
  });
  const registry = createRuntimeRegistryFromManifest({
    manifest: validated,
    handlers,
    shippedAgents: input.shippedAgents,
    agentSqliteByAgent: input.agentSqliteByAgent,
  });
  return { manifest: validated, registry, handlers };
}

export function formatManifestStartupLine(manifestPath: string): string {
  return `synapse manifest: ${manifestPath}`;
}
