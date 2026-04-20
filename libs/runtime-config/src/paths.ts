import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type LocalInfraPaths = {
  packageRoot: string;
  repoRoot: string;
  localDir: string;
  composeFile: string;
  otelConfigFile: string;
};

export function getRuntimeConfigPackageRoot(
  metaUrl: string | URL = import.meta.url,
): string {
  return join(dirname(fileURLToPath(metaUrl)), '..');
}

/**
 * Resolves the monorepo root (directory whose `package.json` has `"name": "synapse"`).
 * Safe for root-level scripts (e.g. `scripts/*.ts`) and deep package files; avoids relying
 * on a fixed number of `..` segments from `import.meta.url`.
 */
export function getRepoRoot(metaUrl: string | URL = import.meta.url): string {
  let dir = dirname(fileURLToPath(metaUrl));
  for (;;) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const { name } = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
          name?: string;
        };
        if (name === 'synapse') {
          return dir;
        }
      } catch {
        /* ignore malformed package.json */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        'Could not resolve monorepo root: no ancestor directory has package.json with name "synapse"',
      );
    }
    dir = parent;
  }
}

export function getLocalInfraPaths(
  metaUrl: string | URL = import.meta.url,
): LocalInfraPaths {
  const packageRoot = getRuntimeConfigPackageRoot(metaUrl);
  const repoRoot = getRepoRoot(metaUrl);
  const localDir = join(repoRoot, 'local');

  return {
    packageRoot,
    repoRoot,
    localDir,
    composeFile: join(localDir, 'docker-compose.yml'),
    otelConfigFile: join(localDir, 'otel', 'collector-config.yaml'),
  };
}
