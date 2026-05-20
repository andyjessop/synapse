import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type ParsedAdapterFixture,
  parseAdapterFixtureJson,
} from './fixture-schemas/index.js';
import type { RuntimeManifestAgent } from './manifest-schema.js';
import { assertRepoRelativePath } from './repo-relative-path.js';

export function assertFixtureSchemaFileExists(
  repoRoot: string,
  schemaPath: string,
): void {
  assertRepoRelativePath(schemaPath);
  const abs = join(repoRoot, schemaPath);
  if (!existsSync(abs)) {
    throw new Error(`Fixture JSON Schema file not found: ${schemaPath}`);
  }
}

/** @deprecated Manifest agents no longer declare adapterFixtures; use scenario adapters. */
export function collectAgentAdapterFixturePaths(
  _agent: RuntimeManifestAgent,
): string[] {
  return [];
}

export function loadAdapterFixtureFile(
  repoRoot: string,
  fixturePath: string,
): ParsedAdapterFixture {
  assertRepoRelativePath(fixturePath);
  const raw = JSON.parse(
    readFileSync(join(repoRoot, fixturePath), 'utf8'),
  ) as unknown;
  const parsed = parseAdapterFixtureJson(raw);
  assertFixtureSchemaFileExists(repoRoot, parsed.schema);
  return parsed;
}

/** @deprecated Use scenario `adapters[]` via active-scenario-run.json in dev. */
export function loadAdapterFixturesForAgent(
  _repoRoot: string,
  _agent: RuntimeManifestAgent,
): ParsedAdapterFixture[] {
  return [];
}
