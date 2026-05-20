import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveDevOnceManifestPath } from './resolve-dev-once-manifest.js';

describe('resolveDevOnceManifestPath', () => {
  it('defaults to manifests/application.json', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'synapse-dev-once-manifest-'));
    const path = resolveDevOnceManifestPath(repoRoot);
    expect(path).toBe(join(repoRoot, 'manifests/application.json'));
  });

  it('honors --manifest-style CLI override', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'synapse-dev-once-manifest-'));
    const path = resolveDevOnceManifestPath(
      repoRoot,
      'manifests/examples/echo.json',
    );
    expect(path).toBe(join(repoRoot, 'manifests/examples/echo.json'));
  });
});
