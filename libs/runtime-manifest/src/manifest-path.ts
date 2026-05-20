import { isAbsolute, normalize, relative, resolve } from 'node:path';

export function warnIfManifestOutsideRepo(
  repoRoot: string,
  manifestPath: string,
): string | undefined {
  const absManifest = isAbsolute(manifestPath)
    ? normalize(manifestPath)
    : resolve(repoRoot, manifestPath);
  const rel = relative(repoRoot, absManifest);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return `Manifest path resolves outside repo root: ${absManifest}`;
  }
  return undefined;
}
