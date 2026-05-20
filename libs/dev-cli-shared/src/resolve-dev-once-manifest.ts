import { resolveManifestPath } from 'runtime-manifest';

/** Manifest for `dev:once`: CLI override, else `manifests/application.json`. */
export function resolveDevOnceManifestPath(
  repoRoot: string,
  cliManifest?: string,
): string {
  return resolveManifestPath(repoRoot, {}, cliManifest);
}
