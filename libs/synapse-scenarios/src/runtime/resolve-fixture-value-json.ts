import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertFixturePayloadPath, type FixtureValue } from 'runtime-manifest';

export function resolveFixtureValueJson(
  repoRoot: string,
  value: FixtureValue,
): unknown {
  if ('file' in value && value.file !== undefined) {
    assertFixturePayloadPath(value.file);
    const raw = readFileSync(join(repoRoot, value.file), 'utf8');
    return JSON.parse(raw) as unknown;
  }
  if ('data' in value) {
    return value.data;
  }
  throw new Error('Fixture value must include file or data');
}
