import { existsSync } from 'node:fs';
import { join, posix } from 'node:path';

export function assertRepoRelativeFixturePath(fixturePath: string): void {
  if (fixturePath.includes('..')) {
    throw new Error(`Fixture path must not contain "..": ${fixturePath}`);
  }
  if (posix.isAbsolute(fixturePath)) {
    throw new Error(`Fixture path must be repo-relative: ${fixturePath}`);
  }
}

export function resolveFixtureAbsolutePath(
  repoRoot: string,
  fixturePath: string,
): string {
  assertRepoRelativeFixturePath(fixturePath);
  const abs = join(repoRoot, fixturePath);
  if (!existsSync(abs)) {
    throw new Error(`Fixture file not found: ${fixturePath}`);
  }
  return abs;
}
