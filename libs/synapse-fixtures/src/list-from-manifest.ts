import type { RuntimeManifest } from 'runtime-manifest';

import {
  collectAgentPollFixturePaths,
  collectAgentWebhookFixturePaths,
} from './discover-agent-fixtures.js';
import { parseSynapseFixtureFile } from './parse.js';

export type ManifestFixtureListEntry = {
  agent: string;
  id: string;
  title: string;
  path: string;
};

export function listManifestFixtures(
  manifest: RuntimeManifest,
  repoRoot: string,
): ManifestFixtureListEntry[] {
  const entries: ManifestFixtureListEntry[] = [];
  for (const agent of manifest.agents) {
    const paths = [
      ...collectAgentWebhookFixturePaths(agent, repoRoot),
      ...collectAgentPollFixturePaths(agent, repoRoot),
    ];
    for (const fixturePath of paths) {
      const fixture = parseSynapseFixtureFile(repoRoot, fixturePath);
      entries.push({
        agent: agent.name,
        id: fixture.id,
        title: fixture.title,
        path: fixturePath,
      });
    }
  }
  return entries;
}

export function resolveFixtureById(
  manifest: RuntimeManifest,
  repoRoot: string,
  fixtureId: string,
): {
  fixture: import('./fixture-schema.js').SynapseFixture;
  path: string;
  agentName: string;
} {
  for (const agent of manifest.agents) {
    const paths = [
      ...collectAgentWebhookFixturePaths(agent, repoRoot),
      ...collectAgentPollFixturePaths(agent, repoRoot),
    ];
    for (const fixturePath of paths) {
      const fixture = parseSynapseFixtureFile(repoRoot, fixturePath);
      if (fixture.id === fixtureId) {
        if (fixture.agent !== agent.name) {
          throw new Error(
            `Fixture ${fixtureId} declares agent ${fixture.agent} but is listed under ${agent.name}`,
          );
        }
        return { fixture, path: fixturePath, agentName: agent.name };
      }
    }
  }
  throw new Error(
    `Unknown fixture id for manifest ${manifest.name}: ${fixtureId}`,
  );
}
