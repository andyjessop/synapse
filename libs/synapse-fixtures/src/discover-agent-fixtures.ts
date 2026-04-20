import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RuntimeManifestAgent } from 'runtime-manifest';

import { assertRepoRelativeFixturePath } from './fixture-path.js';

/** Repo-root-relative directory where an agent's `*.fixture.json` files live. */
export function agentFixtureSearchDir(agentName: string): string | undefined {
  if (agentName === 'agent-reviewer') {
    return 'fixtures/agent-reviewer';
  }
  if (agentName.startsWith('example-')) {
    return `examples/fixtures/example-agent-${agentName}`;
  }
  if (agentName.startsWith('agent-')) {
    return `fixtures/${agentName}`;
  }
  return undefined;
}

export function discoverFixturePathsInDir(
  repoRoot: string,
  dir: string,
): string[] {
  assertRepoRelativeFixturePath(dir);
  const absDir = join(repoRoot, dir);
  if (!existsSync(absDir)) {
    return [];
  }
  return readdirSync(absDir)
    .filter((name) => name.endsWith('.fixture.json'))
    .sort()
    .map((name) => `${dir}/${name}`);
}

/** Manifest webhook paths plus every `*.fixture.json` in the agent's fixture directory. */
export function collectAgentWebhookFixturePaths(
  agent: RuntimeManifestAgent,
  repoRoot: string,
): string[] {
  const explicit = agent.fixtures?.webhook ?? [];
  const searchDir = agentFixtureSearchDir(agent.name);
  const discovered =
    searchDir === undefined
      ? []
      : discoverFixturePathsInDir(repoRoot, searchDir);

  const seen = new Set<string>();
  const paths: string[] = [];
  for (const path of [...explicit, ...discovered]) {
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    paths.push(path);
  }
  return paths.sort();
}

/** @deprecated Use {@link collectAgentWebhookFixturePaths}. */
export function collectAgentFixturePaths(
  agent: RuntimeManifestAgent,
  repoRoot: string,
): string[] {
  return collectAgentWebhookFixturePaths(agent, repoRoot);
}
