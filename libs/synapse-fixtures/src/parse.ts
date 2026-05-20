import { readFileSync } from 'node:fs';

import {
  assertFixtureSchemaFileExists,
  parsePollRunLoopFixtureJson,
  parseWebhookRunLoopFixtureJson,
} from 'runtime-manifest';

import { resolveFixtureAbsolutePath } from './fixture-path.js';
import type { SynapseFixture } from './fixture-schema.js';

function isPollFixtureJson(json: unknown): boolean {
  return (
    typeof json === 'object' &&
    json !== null &&
    'ingress' in json &&
    typeof (json as { ingress: unknown }).ingress === 'object' &&
    (json as { ingress: { kind?: string } }).ingress?.kind === 'poll'
  );
}

export function parseSynapseFixtureJson(json: unknown): SynapseFixture {
  if (isPollFixtureJson(json)) {
    return parsePollRunLoopFixtureJson(json);
  }
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
  body: Extract<SynapseFixture['ingress'], { kind: 'webhook' }>,
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

export function readPollInjectCandidates(
  repoRoot: string,
  ingress: Extract<SynapseFixture['ingress'], { kind: 'poll' }>,
): unknown[] {
  let raw: unknown = ingress.body;
  if (
    typeof ingress.body === 'object' &&
    ingress.body !== null &&
    'file' in ingress.body &&
    typeof (ingress.body as { file: string }).file === 'string'
  ) {
    const rel = (ingress.body as { file: string }).file;
    const abs = resolveFixtureAbsolutePath(repoRoot, rel);
    raw = JSON.parse(readFileSync(abs, 'utf8')) as unknown;
  }
  if (raw === undefined) {
    throw new Error('Poll inject fixture requires ingress.body');
  }
  if (Array.isArray(raw)) {
    return raw;
  }
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'candidates' in raw &&
    Array.isArray((raw as { candidates: unknown[] }).candidates)
  ) {
    return (raw as { candidates: unknown[] }).candidates;
  }
  return [raw];
}
