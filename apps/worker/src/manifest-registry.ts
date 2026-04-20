import { getRepoRoot } from 'runtime-config';
import {
  formatManifestStartupLine,
  loadValidatedManifestRegistry,
  resolveManifestPath,
  type ValidatedRuntimeManifest,
} from 'runtime-manifest';
import {
  type RuntimeRegistry,
  wrapManifestRuntimeRegistry,
} from 'runtime-worker';

export type LoadedManifestRegistry = {
  registry: RuntimeRegistry;
  manifest: ValidatedRuntimeManifest;
  manifestPath: string;
};

export async function loadWorkerManifestRegistry(
  env: Record<string, string | undefined> = process.env,
  metaUrl: string | URL = import.meta.url,
  cliManifest?: string,
): Promise<LoadedManifestRegistry> {
  const repoRoot = getRepoRoot(metaUrl);
  const manifestPath = resolveManifestPath(repoRoot, env, cliManifest);
  const { manifest, registry: manifestRegistry } =
    await loadValidatedManifestRegistry({
      repoRoot,
      manifestPath,
      env,
    });

  console.log(formatManifestStartupLine(manifestPath));

  return {
    registry: wrapManifestRuntimeRegistry(manifestRegistry),
    manifest,
    manifestPath,
  };
}

export function manifestPlanningLogFields(
  manifest: ValidatedRuntimeManifest,
  agentName: string,
  eventType: string,
): Record<string, string> {
  return {
    manifest_name: manifest.name,
    manifest_path: manifest.manifestPath,
    agent_name: agentName,
    event_type: eventType,
  };
}
