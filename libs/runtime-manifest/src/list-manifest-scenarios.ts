import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { discoverScenarioFilePaths } from './discover-scenario-files.js';
import type { RuntimeManifest } from './manifest-schema.js';
import { parseScenarioFileJson } from './scenario-schema.js';
import type { Scenario } from './scenario-schema.js';

/** Scenario files that declare at least one scenario for `manifest.name`. */
export function listScenarioPathsForManifest(
  repoRoot: string,
  manifest: RuntimeManifest,
): string[] {
  const paths: string[] = [];
  for (const filePath of discoverScenarioFilePaths(repoRoot)) {
    const raw = JSON.parse(
      readFileSync(join(repoRoot, filePath), 'utf8'),
    ) as unknown;
    const file = parseScenarioFileJson(raw);
    if (
      file.scenarios.some((scenario) =>
        scenario.manifests.includes(manifest.name),
      )
    ) {
      paths.push(filePath);
    }
  }
  return paths;
}

export function scenariosForManifest(
  file: { scenarios: Scenario[] },
  manifestName: string,
): Scenario[] {
  return file.scenarios.filter((scenario) =>
    scenario.manifests.includes(manifestName),
  );
}
