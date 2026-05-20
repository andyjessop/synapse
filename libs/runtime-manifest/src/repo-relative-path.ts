import { posix } from 'node:path';

/** Repo-root-relative POSIX path (no `..`, not absolute). */
export function assertRepoRelativePath(path: string): void {
  if (path.includes('..')) {
    throw new Error(`Path must not contain "..": ${path}`);
  }
  if (posix.isAbsolute(path)) {
    throw new Error(`Path must be repo-relative: ${path}`);
  }
}
