import {
  fixtureIngressIsMounted,
  fixturePollIngressIsMounted,
  type RuntimeManifest,
} from 'runtime-manifest';

import {
  collectAgentPollFixturePaths,
  collectAgentWebhookFixturePaths,
} from './discover-agent-fixtures.js';
import { assertRepoRelativeFixturePath } from './fixture-path.js';
import { parseSynapseFixtureFile } from './parse.js';

export function collectFixtureEventTypes(
  fixture: ReturnType<typeof parseSynapseFixtureFile>,
): string[] {
  const types: string[] = [];
  if (fixture.expect?.rootEventType !== undefined) {
    types.push(fixture.expect.rootEventType);
  }
  if (fixture.expect?.eventTypes !== undefined) {
    types.push(...fixture.expect.eventTypes);
  }
  if (fixture.expect?.terminalEventTypes !== undefined) {
    types.push(...fixture.expect.terminalEventTypes);
  }
  return types;
}

export function validateManifestFixtureEntries(
  manifest: RuntimeManifest,
  deps: {
    repoRoot: string;
    knownEventTypes: ReadonlySet<string>;
  },
): void {
  const seenIds = new Set<string>();

  for (const agent of manifest.agents) {
    const paths = [
      ...collectAgentWebhookFixturePaths(agent, deps.repoRoot),
      ...collectAgentPollFixturePaths(agent, deps.repoRoot),
    ];
    if (paths.length === 0) {
      continue;
    }

    for (const fixturePath of paths) {
      assertRepoRelativeFixturePath(fixturePath);
      const fixture = parseSynapseFixtureFile(deps.repoRoot, fixturePath);

      if (fixture.agent !== agent.name) {
        throw new Error(
          `Fixture ${fixturePath} agent ${fixture.agent} does not match manifest agent ${agent.name}`,
        );
      }

      if (seenIds.has(fixture.id)) {
        throw new Error(`Duplicate fixture id in manifest: ${fixture.id}`);
      }
      seenIds.add(fixture.id);

      if (fixture.ingress.kind === 'webhook') {
        if (
          manifest.webhooks !== undefined &&
          manifest.webhooks.length > 0 &&
          !fixtureIngressIsMounted(fixture.ingress, manifest)
        ) {
          throw new Error(
            `Fixture ${fixture.id} ingress ${fixture.ingress.method} ${fixture.ingress.path} is not mounted by manifest webhooks`,
          );
        }
      } else if (fixture.ingress.kind === 'poll') {
        if (!fixturePollIngressIsMounted(fixture.ingress, manifest)) {
          throw new Error(
            `Fixture ${fixture.id} poll source ${fixture.ingress.source} is not mounted or disabled in manifest pollers`,
          );
        }
      }

      for (const eventType of collectFixtureEventTypes(fixture)) {
        if (!deps.knownEventTypes.has(eventType)) {
          throw new Error(
            `Unknown event type in fixture ${fixture.id}: ${eventType}`,
          );
        }
      }
    }
  }
}
