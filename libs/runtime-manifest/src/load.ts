import { isAbsolute, resolve } from 'node:path';

import { type AgentHandler } from 'runtime-agent';
import { eventRegistry } from 'runtime-events';

import { parseRuntimeManifestFile } from './parse.js';
import type { ManifestRuntimeRegistry } from './registry.js';
import { createRuntimeRegistryFromManifest } from './registry.js';
import { resolveManifestHandlers } from './resolve-handler.js';
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
  env?: Record<string, string | undefined>;
  agentSqliteByAgent?: ReadonlyMap<
    string,
    import('runtime-agent').AgentSqliteDefinition
  >;
}): Promise<{
  manifest: ValidatedRuntimeManifest;
  registry: ManifestRuntimeRegistry;
  handlers: Map<string, AgentHandler>;
}> {
  const env = input.env ?? process.env;
  const manifest = parseRuntimeManifestFile(input.manifestPath);
  const handlers = await resolveManifestHandlers(
    input.repoRoot,
    manifest.agents.map((a) => a.handler),
    env,
  );
  const validated = validateRuntimeManifest(manifest, {
    manifestPath: input.manifestPath,
    repoRoot: input.repoRoot,
    knownEventTypes: new Set(Object.keys(eventRegistry)),
    resolveHandler: (handlerPath) => {
      const handler = handlers.get(handlerPath);
      if (handler === undefined) {
        throw new Error(`Handler not resolved: ${handlerPath}`);
      }
      return handler;
    },
  });
  const registry = createRuntimeRegistryFromManifest({
    manifest: validated,
    handlers,
    agentSqliteByAgent: input.agentSqliteByAgent,
  });
  return { manifest: validated, registry, handlers };
}

export function formatManifestStartupLine(manifestPath: string): string {
  return `synapse manifest: ${manifestPath}`;
}
