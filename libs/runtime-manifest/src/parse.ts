import { readFileSync } from 'node:fs';

import {
  type RuntimeManifest,
  runtimeManifestSchema,
} from './manifest-schema.js';

export function parseRuntimeManifestJson(json: unknown): RuntimeManifest {
  return runtimeManifestSchema.parse(json);
}

/** Reads a manifest JSON file from an absolute or repo-resolved path. */
export function parseRuntimeManifestFile(
  manifestPath: string,
): RuntimeManifest {
  const raw = readFileSync(manifestPath, 'utf8');
  return parseRuntimeManifestJson(JSON.parse(raw) as unknown);
}
