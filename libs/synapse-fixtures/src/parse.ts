import { readFileSync } from 'node:fs';

import {
  assertFixtureSchemaFileExists,
  parseWebhookRunLoopFixtureJson,
} from 'runtime-manifest';

import { resolveFixtureAbsolutePath } from './fixture-path.js';
import type { SynapseFixture } from './fixture-schema.js';

export function parseSynapseFixtureJson(json: unknown): SynapseFixture {
  return parseWebhookRunLoopFixtureJson(json);
}

export function parseSynapseFixtureFile(
  repoRoot: string,
  fixturePath: string,
): SynapseFixture {
  const abs = resolveFixtureAbsolutePath(repoRoot, fixturePath);
  const raw = JSON.parse(readFileSync(abs, 'utf8')) as unknown;
  const parsed = parseSynapseFixtureJson(raw);
  assertFixtureSchemaFileExists(repoRoot, parsed.schema);
  return parsed;
}

export function readWebhookBodyBytes(
  repoRoot: string,
  body: SynapseFixture['ingress'] & { kind: 'webhook' },
): Buffer {
  if (
    typeof body.body === 'object' &&
    body.body !== null &&
    'file' in body.body &&
    typeof (body.body as { file: string }).file === 'string'
  ) {
    const rel = (body.body as { file: string }).file;
    const abs = resolveFixtureAbsolutePath(repoRoot, rel);
    return readFileSync(abs);
  }
  return Buffer.from(JSON.stringify(body.body), 'utf8');
}
