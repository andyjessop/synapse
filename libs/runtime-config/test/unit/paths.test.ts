import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getLocalInfraPaths,
  getRepoRoot,
  getRuntimeConfigPackageRoot,
} from '../../src/paths';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = join(packageRoot, '../..');

describe('local path helpers', () => {
  it('resolves package and repo roots from import.meta.url rather than cwd', () => {
    const sourceMetaUrl = pathToFileURL(join(packageRoot, 'src/paths.ts')).href;

    expect(getRuntimeConfigPackageRoot(sourceMetaUrl)).toBe(packageRoot);
    expect(getRepoRoot(sourceMetaUrl)).toBe(repoRoot);
  });

  it('resolves repo root from root-level scripts (not only libs/runtime-config depth)', () => {
    const scriptMetaUrl = pathToFileURL(join(repoRoot, 'scripts/dev.ts')).href;
    expect(getRepoRoot(scriptMetaUrl)).toBe(repoRoot);
  });

  it('ignores malformed package.json while searching ancestors', () => {
    const monorepo = mkdtempSync(join(tmpdir(), 'synapse-walk-'));
    const mid = join(monorepo, 'mid');
    mkdirSync(join(mid, 'leaf'), { recursive: true });
    writeFileSync(join(mid, 'package.json'), 'not-json');
    writeFileSync(
      join(monorepo, 'package.json'),
      JSON.stringify({ name: 'synapse', private: true }),
    );
    const meta = pathToFileURL(join(mid, 'leaf', 'a.ts')).href;
    expect(getRepoRoot(meta)).toBe(monorepo);
  });

  it('continues past package.json files that are not the monorepo root', () => {
    const monorepo = mkdtempSync(join(tmpdir(), 'synapse-skip-pkg-'));
    const outer = join(monorepo, 'outer');
    mkdirSync(join(outer, 'inner'), { recursive: true });
    writeFileSync(
      join(outer, 'package.json'),
      JSON.stringify({ name: '@scope/pkg', private: true }),
    );
    writeFileSync(
      join(monorepo, 'package.json'),
      JSON.stringify({ name: 'synapse', private: true }),
    );
    const meta = pathToFileURL(join(outer, 'inner', 'x.ts')).href;
    expect(getRepoRoot(meta)).toBe(monorepo);
  });

  it('throws when no monorepo root exists above the module', () => {
    const dir = mkdtempSync(join(tmpdir(), 'synapse-no-root-'));
    const fileUrl = pathToFileURL(join(dir, 'orphan.ts')).href;
    expect(() => getRepoRoot(fileUrl)).toThrow(/monorepo root/);
  });

  it('returns all local infrastructure paths', () => {
    const paths = getLocalInfraPaths(
      pathToFileURL(join(packageRoot, 'src/paths.ts')).href,
    );

    expect(paths).toEqual({
      packageRoot,
      repoRoot,
      localDir: join(repoRoot, 'local'),
      composeFile: join(repoRoot, 'local/docker-compose.yml'),
      otelConfigFile: join(repoRoot, 'local/otel/collector-config.yaml'),
    });
    expect(existsSync(paths.composeFile)).toBe(true);
    expect(existsSync(paths.otelConfigFile)).toBe(true);
  });
});
