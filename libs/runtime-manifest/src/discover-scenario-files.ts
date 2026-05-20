import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { assertScenarioFilePath } from './scenario-layout-paths.js';

function collectScenarioFiles(
  absDir: string,
  repoRoot: string,
  out: string[],
): void {
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const absPath = join(absDir, entry.name);
    if (entry.isDirectory()) {
      collectScenarioFiles(absPath, repoRoot, out);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.scenarios.json')) {
      continue;
    }
    const rel = relative(repoRoot, absPath).replaceAll('\\', '/');
    assertScenarioFilePath(rel);
    out.push(rel);
  }
}

/** Repo-root-relative `*.scenarios.json` paths under `scenarios/` and test fixtures. */
export function discoverScenarioFilePaths(repoRoot: string): string[] {
  const paths: string[] = [];
  const roots = [
    join(repoRoot, 'scenarios'),
    join(repoRoot, 'libs/runtime-manifest/test/fixtures/scenarios'),
  ];
  for (const root of roots) {
    if (!existsSync(root)) {
      continue;
    }
    collectScenarioFiles(root, repoRoot, paths);
  }
  return [...new Set(paths)].sort();
}
