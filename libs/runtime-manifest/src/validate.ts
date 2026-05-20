import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentDefinition } from 'runtime-agent';
import {
  listScenarioPathsForManifest,
  scenariosForManifest,
} from './list-manifest-scenarios.js';
import { warnIfManifestOutsideRepo } from './manifest-path.js';
import type { RuntimeManifest } from './manifest-schema.js';
import { assertRepoRelativePath } from './repo-relative-path.js';
import type { Scenario } from './scenario-schema.js';
import { parseScenarioFileJson } from './scenario-schema.js';

export const MANIFEST_HANDLER_REACTOR_NAME = 'handler' as const;

export const AGENT_REVIEWER_MANIFEST_AGENT_NAME = 'agent-reviewer' as const;

export type ValidatedRuntimeManifest = RuntimeManifest & {
  manifestPath: string;
};

function assertUniqueManifestListEntries(manifest: RuntimeManifest): void {
  const seenWebhookSources = new Set<string>();
  for (const entry of manifest.webhooks ?? []) {
    if (seenWebhookSources.has(entry.source)) {
      throw new Error(`Duplicate webhook source in manifest: ${entry.source}`);
    }
    seenWebhookSources.add(entry.source);
  }
}

function validateManifestScenarios(
  manifest: RuntimeManifest,
  deps: {
    repoRoot: string;
    validateScenarioForManifest?: (
      scenario: Scenario,
      manifest: RuntimeManifest,
    ) => void;
  },
): void {
  const seenScenarioIds = new Set<string>();
  for (const scenarioPath of listScenarioPathsForManifest(
    deps.repoRoot,
    manifest,
  )) {
    assertRepoRelativePath(scenarioPath);
    const abs = join(deps.repoRoot, scenarioPath);
    if (!existsSync(abs)) {
      throw new Error(
        `Scenario file not found for manifest ${manifest.name}: ${scenarioPath}`,
      );
    }
    const raw = JSON.parse(readFileSync(abs, 'utf8')) as unknown;
    const file = parseScenarioFileJson(raw);
    for (const scenario of scenariosForManifest(file, manifest.name)) {
      if (seenScenarioIds.has(scenario.id)) {
        throw new Error(
          `Duplicate scenario id for manifest ${manifest.name}: ${scenario.id}`,
        );
      }
      seenScenarioIds.add(scenario.id);
      deps.validateScenarioForManifest?.(scenario, manifest);
    }
  }
}

export function validateRuntimeManifest(
  manifest: RuntimeManifest,
  deps: {
    manifestPath: string;
    repoRoot: string;
    knownEventTypes: ReadonlySet<string>;
    shippedAgents: ReadonlyMap<string, AgentDefinition>;
    validateScenarioForManifest?: (
      scenario: Scenario,
      manifest: RuntimeManifest,
    ) => void;
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
  for (const entry of manifest.agents) {
    if (agentNames.has(entry.name)) {
      throw new Error(`Duplicate manifest agent name: ${entry.name}`);
    }
    agentNames.add(entry.name);

    const agentDef = deps.shippedAgents.get(entry.name);
    if (agentDef === undefined) {
      throw new Error(
        `Manifest mounts unknown agent: ${entry.name}. Register it in the worker shipped agent list.`,
      );
    }

    for (const eventType of agentDef.handles) {
      if (!deps.knownEventTypes.has(eventType)) {
        throw new Error(
          `Agent ${agentDef.name} handles unknown event type: ${eventType}`,
        );
      }
    }

    for (const source of agentDef.usesAdapters ?? []) {
      if (!manifest.adapters?.some((a) => a.source === source)) {
        throw new Error(
          `Agent ${agentDef.name} uses adapter ${source} but manifest does not mount it`,
        );
      }
    }
  }

  assertUniqueManifestListEntries(manifest);
  validateManifestScenarios(manifest, {
    repoRoot: deps.repoRoot,
    validateScenarioForManifest: deps.validateScenarioForManifest,
  });

  return { ...manifest, manifestPath: deps.manifestPath };
}
