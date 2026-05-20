import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertRepoRelativePath } from 'runtime-manifest';

export { assertRepoRelativePath as assertRepoRelativeFixturePath };

export function resolveFixtureAbsolutePath(
  repoRoot: string,
  fixturePath: string,
): string {
  assertRepoRelativePath(fixturePath);
  const abs = join(repoRoot, fixturePath);
  if (!existsSync(abs)) {
    throw new Error(`Fixture file not found: ${fixturePath}`);
  }
  return abs;
}
