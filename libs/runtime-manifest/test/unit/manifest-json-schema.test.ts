import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  assertFixtureSchemaFileExists,
  MANIFEST_SCHEMA_PATH,
  parseRuntimeManifestFile,
} from '../../src/index.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('runtime manifest JSON Schema', () => {
  it('ships schema file at MANIFEST_SCHEMA_PATH', () => {
    assertFixtureSchemaFileExists(repoRoot, MANIFEST_SCHEMA_PATH);
    const raw = readFileSync(join(repoRoot, MANIFEST_SCHEMA_PATH), 'utf8');
    const doc = JSON.parse(raw) as {
      $id?: string;
      properties?: { schema?: { const?: string } };
    };
    expect(doc.$id).toBe(MANIFEST_SCHEMA_PATH);
    expect(doc.properties?.schema?.const).toBe(MANIFEST_SCHEMA_PATH);
  });

  it('all shipped manifests declare schema and parse', () => {
    for (const rel of [
      'manifests/application.json',
      'manifests/examples/echo.json',
      'manifests/examples/echo-poll.json',
      'manifests/examples/all.json',
      'manifests/debug/reviewer-only.json',
    ]) {
      const manifest = parseRuntimeManifestFile(join(repoRoot, rel));
      expect(manifest.schema).toBe(MANIFEST_SCHEMA_PATH);
    }
  });
});
