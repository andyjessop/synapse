import crypto from 'node:crypto';
import path from 'node:path';
import type { ShadowGitBridgeOptions } from './types';

export const DEFAULT_SHADOW_ROOT_NAME = '.deus-shadow';
const LEGACY_SHADOW_ROOT_NAMES = new Set(['deus-shadow', 'omnigraph-shadow']);

export function getShadowRootName(options?: ShadowGitBridgeOptions): string {
  const shadowRootName = options?.shadowRootName?.trim();
  if (!shadowRootName) {
    return DEFAULT_SHADOW_ROOT_NAME;
  }
  if (
    shadowRootName === '.' ||
    shadowRootName === '..' ||
    shadowRootName.includes('/') ||
    shadowRootName.includes('\\')
  ) {
    throw new Error(
      `Invalid shadowRootName "${shadowRootName}". Expected a single directory name.`,
    );
  }
  return shadowRootName;
}

export function getShadowPathSegment(options?: ShadowGitBridgeOptions): string {
  return `/${getShadowRootName(options)}/`;
}

export function getShadowRootPath(
  repoPath: string,
  options?: ShadowGitBridgeOptions,
): string {
  const canonicalRepoPath = path.resolve(repoPath);
  const repoBaseName = sanitizeRepoBaseName(path.basename(canonicalRepoPath));
  const repoHash = crypto
    .createHash('sha256')
    .update(canonicalRepoPath)
    .digest('hex')
    .slice(0, 12);
  return path.join(
    path.dirname(canonicalRepoPath),
    getShadowRootName(options),
    `${repoBaseName}-${repoHash}`,
  );
}

export function isShadowPath(
  candidatePath: string | undefined,
  options?: ShadowGitBridgeOptions,
): boolean {
  if (!candidatePath) {
    return false;
  }

  const normalizedPath = candidatePath.replaceAll('\\', '/');
  const shadowRootNames = new Set([
    getShadowRootName(options),
    ...LEGACY_SHADOW_ROOT_NAMES,
  ]);
  for (const shadowRootName of shadowRootNames) {
    if (
      normalizedPath.includes(`/${shadowRootName}/`) ||
      normalizedPath.endsWith(`/${shadowRootName}`)
    ) {
      return true;
    }
  }
  return false;
}

function sanitizeRepoBaseName(repoBaseName: string): string {
  const candidate = repoBaseName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return candidate.length > 0 ? candidate : 'repo';
}
