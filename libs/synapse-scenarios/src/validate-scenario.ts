import type { RuntimeManifest, Scenario } from 'runtime-manifest';
import {
  assertScenarioLayoutPaths,
  resolveScenarioIngressSource,
} from 'runtime-manifest';

export function validateScenarioForManifest(
  scenario: Scenario,
  manifest: RuntimeManifest,
): void {
  if (!scenario.manifests.includes(manifest.name)) {
    throw new Error(
      `Scenario ${scenario.id} is not registered for manifest ${manifest.name} (manifests: ${scenario.manifests.join(', ')})`,
    );
  }
  resolveScenarioIngressSource(
    scenario.ingress.source,
    manifest,
    manifest.name,
  );
  assertScenarioLayoutPaths(scenario);

  if (scenario.ingress.fixtures.length === 0) {
    throw new Error(
      `Scenario ${scenario.id}: ingress.fixtures must have at least one entry`,
    );
  }
}
