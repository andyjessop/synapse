import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RuntimeManifestAgent } from 'runtime-manifest';

import { assertRepoRelativeFixturePath } from './fixture-path.js';
import { parseSynapseFixtureFile } from './parse.js';

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

function mergeFixturePaths(explicit: string[], discovered: string[]): string[] {
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

function filterFixturePathsByIngressKind(
  repoRoot: string,
  paths: string[],
  kind: 'webhook' | 'poll',
): string[] {
  const matched: string[] = [];
  for (const path of paths) {
    const fixture = parseSynapseFixtureFile(repoRoot, path);
    if (fixture.ingress.kind === kind) {
      matched.push(path);
    }
  }
  return matched;
}

/**
 * Legacy run-loop fixture paths on disk (compatibility tests only).
 * `dev:once --list` uses scenario `manifests[]`, not this discovery.
 */
export function collectAgentWebhookFixturePaths(
  _agent: RuntimeManifestAgent,
  _repoRoot: string,
): string[] {
  return [];
}

/** @deprecated Legacy poll fixture discovery; scenarios use `*.scenarios.json`. */
export function collectAgentPollFixturePaths(
  _agent: RuntimeManifestAgent,
  _repoRoot: string,
): string[] {
  return [];
}

/** Opt-in legacy disk discovery for compatibility tests. */
export function collectLegacyWebhookFixturePathsOnDisk(
  agent: RuntimeManifestAgent,
  repoRoot: string,
): string[] {
  const searchDir = agentFixtureSearchDir(agent.name);
  const discovered =
    searchDir === undefined
      ? []
      : discoverFixturePathsInDir(repoRoot, searchDir);
  return filterFixturePathsByIngressKind(
    repoRoot,
    mergeFixturePaths([], discovered),
    'webhook',
  );
}

/** @deprecated Use {@link collectAgentWebhookFixturePaths}. */
export function collectAgentFixturePaths(
  agent: RuntimeManifestAgent,
  repoRoot: string,
): string[] {
  return collectAgentWebhookFixturePaths(agent, repoRoot);
}
