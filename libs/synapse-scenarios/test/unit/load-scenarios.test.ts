import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRuntimeManifestFile } from 'runtime-manifest';
import { describe, expect, it } from 'vitest';

import {
  listScenariosForManifest,
  loadScenariosForManifest,
  resolveScenarioById,
} from '../../src/load-scenarios.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('synapse-scenarios', () => {
  it('loads scenarios that declare the active manifest name', () => {
    const manifest = parseRuntimeManifestFile(
      join(repoRoot, 'manifests/examples/echo.json'),
    );
    const scenarios = loadScenariosForManifest(repoRoot, manifest);
    expect(scenarios.map((s) => s.id)).toContain('example/echo');
  });

  it('resolveScenarioById returns scenario', () => {
    const manifest = parseRuntimeManifestFile(
      join(repoRoot, 'manifests/examples/echo.json'),
    );
    const { scenario } = resolveScenarioById(
      repoRoot,
      manifest,
      'example/echo',
    );
    expect(scenario.ingress.source).toBe(
      'synapse.webhooks.example-echo-ping.v1',
    );
  });

  it('listScenariosForManifest includes titles', () => {
    const manifest = parseRuntimeManifestFile(
      join(repoRoot, 'manifests/examples/echo.json'),
    );
    const list = listScenariosForManifest(repoRoot, manifest);
    expect(list.some((e) => e.id === 'example/echo')).toBe(true);
  });

  it('resolves poll scenario on echo-poll manifest', () => {
    const manifest = parseRuntimeManifestFile(
      join(repoRoot, 'manifests/examples/echo-poll.json'),
    );
    const { scenario } = resolveScenarioById(
      repoRoot,
      manifest,
      'example/echo-poll',
    );
    expect(scenario.ingress.source).toBe(
      'synapse.poll.example-in-memory-heartbeat.v1',
    );
  });
});
