import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertRepoRelativePath,
  listScenarioPathsForManifest,
  parseScenarioFileJson,
  scenariosForManifest,
  type RuntimeManifest,
  type Scenario,
  type ScenarioFile,
} from 'runtime-manifest';

import { validateScenarioForManifest } from './validate-scenario.js';

export type ScenarioListEntry = {
  id: string;
  title: string;
  ingressSource: string;
  scenarioFilePath: string;
};

export function parseScenarioFile(
  repoRoot: string,
  scenarioFilePath: string,
): ScenarioFile {
  assertRepoRelativePath(scenarioFilePath);
  const raw = JSON.parse(
    readFileSync(join(repoRoot, scenarioFilePath), 'utf8'),
  ) as unknown;
  return parseScenarioFileJson(raw);
}

export function loadScenariosForManifest(
  repoRoot: string,
  manifest: RuntimeManifest,
): Scenario[] {
  const seenIds = new Set<string>();
  const scenarios: Scenario[] = [];

  for (const filePath of listScenarioPathsForManifest(repoRoot, manifest)) {
    const file = parseScenarioFile(repoRoot, filePath);
    for (const scenario of scenariosForManifest(file, manifest.name)) {
      if (seenIds.has(scenario.id)) {
        throw new Error(
          `Duplicate scenario id ${scenario.id} for manifest ${manifest.name}`,
        );
      }
      seenIds.add(scenario.id);
      validateScenarioForManifest(scenario, manifest);
      scenarios.push(scenario);
    }
  }

  return scenarios;
}

export function resolveScenarioById(
  repoRoot: string,
  manifest: RuntimeManifest,
  scenarioId: string,
): { scenario: Scenario; scenarioFilePath: string } {
  for (const filePath of listScenarioPathsForManifest(repoRoot, manifest)) {
    const file = parseScenarioFile(repoRoot, filePath);
    const match = scenariosForManifest(file, manifest.name).find(
      (s) => s.id === scenarioId,
    );
    if (match !== undefined) {
      validateScenarioForManifest(match, manifest);
      return { scenario: match, scenarioFilePath: filePath };
    }
  }
  throw new Error(
    `Unknown scenario id for manifest ${manifest.name}: ${scenarioId}`,
  );
}

export function listScenariosForManifest(
  repoRoot: string,
  manifest: RuntimeManifest,
): ScenarioListEntry[] {
  const entries: ScenarioListEntry[] = [];
  for (const filePath of listScenarioPathsForManifest(repoRoot, manifest)) {
    const file = parseScenarioFile(repoRoot, filePath);
    for (const scenario of scenariosForManifest(file, manifest.name)) {
      validateScenarioForManifest(scenario, manifest);
      entries.push({
        id: scenario.id,
        title: scenario.title ?? scenario.id,
        ingressSource: scenario.ingress.source,
        scenarioFilePath: filePath,
      });
    }
  }
  return entries;
}
