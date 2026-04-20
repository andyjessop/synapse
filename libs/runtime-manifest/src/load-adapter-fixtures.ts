import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertRepoRelativeFixturePath } from 'synapse-fixtures';

import {
  type ParsedAdapterFixture,
  parseAdapterFixtureJson,
} from './fixture-schemas/index.js';
import type { RuntimeManifestAgent } from './manifest-schema.js';

export function assertFixtureSchemaFileExists(
  repoRoot: string,
  schemaPath: string,
): void {
  assertRepoRelativeFixturePath(schemaPath);
  const abs = join(repoRoot, schemaPath);
  if (!existsSync(abs)) {
    throw new Error(`Fixture JSON Schema file not found: ${schemaPath}`);
  }
}

export function collectAgentAdapterFixturePaths(
  agent: RuntimeManifestAgent,
): string[] {
  return [...(agent.fixtures?.adapter ?? [])].sort();
}

export function loadAdapterFixtureFile(
  repoRoot: string,
  fixturePath: string,
): ParsedAdapterFixture {
  assertRepoRelativeFixturePath(fixturePath);
  const raw = JSON.parse(
    readFileSync(join(repoRoot, fixturePath), 'utf8'),
  ) as unknown;
  const parsed = parseAdapterFixtureJson(raw);
  assertFixtureSchemaFileExists(repoRoot, parsed.schema);
  return parsed;
}

export function loadAdapterFixturesForAgent(
  repoRoot: string,
  agent: RuntimeManifestAgent,
): ParsedAdapterFixture[] {
  return collectAgentAdapterFixturePaths(agent).map((path) =>
    loadAdapterFixtureFile(repoRoot, path),
  );
}
