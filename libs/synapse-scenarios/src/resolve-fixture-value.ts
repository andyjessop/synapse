import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertFixturePayloadPath, type FixtureValue } from 'runtime-manifest';

export function resolveFixtureValueBytes(
  repoRoot: string,
  value: FixtureValue,
): Buffer {
  if ('file' in value && value.file !== undefined) {
    assertFixturePayloadPath(value.file);
    return readFileSync(join(repoRoot, value.file));
  }
  if ('data' in value) {
    return Buffer.from(JSON.stringify(value.data), 'utf8');
  }
  throw new Error('Fixture value must include file or data');
}

export function resolveWebhookBodyBytes(
  repoRoot: string,
  value: FixtureValue,
): Buffer {
  return resolveFixtureValueBytes(repoRoot, value);
}
