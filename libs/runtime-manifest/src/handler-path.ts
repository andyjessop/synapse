import { isAbsolute, join, normalize, relative, resolve } from 'node:path';

const ALLOWLIST_PREFIXES = ['agents/', 'examples/agents/'] as const;

export function assertHandlerPathAllowlisted(handlerPath: string): void {
  if (handlerPath.includes('..')) {
    throw new Error(
      `Manifest handler path must not contain "..": ${handlerPath}`,
    );
  }
  if (!ALLOWLIST_PREFIXES.some((prefix) => handlerPath.startsWith(prefix))) {
    throw new Error(
      `Manifest handler path must start with agents/ or examples/agents/: ${handlerPath}`,
    );
  }
}

export function resolveHandlerAbsolutePath(
  repoRoot: string,
  handlerPath: string,
): string {
  assertHandlerPathAllowlisted(handlerPath);
  const abs = resolve(repoRoot, handlerPath);
  const rel = relative(repoRoot, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `Manifest handler path resolves outside repo root: ${handlerPath}`,
    );
  }
  return abs;
}

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

export function isLocalManifestImportsAllowed(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.SYNAPSE_ALLOW_LOCAL_MANIFEST_IMPORTS === '1';
}

export function resolveHandlerPathForImport(
  repoRoot: string,
  handlerPath: string,
  env: Record<string, string | undefined> = process.env,
): string {
  if (handlerPath.includes('..')) {
    throw new Error(
      `Manifest handler path must not contain "..": ${handlerPath}`,
    );
  }
  if (isLocalManifestImportsAllowed(env)) {
    const abs = resolve(repoRoot, handlerPath);
    const rel = relative(repoRoot, abs);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(
        `Manifest handler path resolves outside repo root: ${handlerPath}`,
      );
    }
    return abs;
  }
  return resolveHandlerAbsolutePath(repoRoot, handlerPath);
}
