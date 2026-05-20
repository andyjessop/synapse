import type { RuntimeManifest } from './manifest-schema.js';

export function loadMountedAdapterSources(
  manifest: RuntimeManifest,
): ReadonlySet<string> {
  const mounts = manifest.adapters ?? [];
  return new Set(mounts.map((entry) => entry.source));
}

export function assertScenarioAdaptersMounted(
  manifest: RuntimeManifest,
  scenarioId: string,
  adapterSources: readonly string[],
): void {
  const mounted = loadMountedAdapterSources(manifest);
  for (const source of adapterSources) {
    if (!mounted.has(source)) {
      throw new Error(
        `Scenario ${scenarioId} references adapter source ${source} which is not mounted on manifest ${manifest.name}. Add adapters[] with that source to the active manifest.`,
      );
    }
  }
}
