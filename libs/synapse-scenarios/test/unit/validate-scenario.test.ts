import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MANIFEST_SCHEMA_PATH,
  parseRuntimeManifestJson,
} from 'runtime-manifest';
import { describe, expect, it } from 'vitest';

import { validateScenarioForManifest } from '../../src/validate-scenario.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

const manifestDocumentBase = {
  version: 1 as const,
  schema: MANIFEST_SCHEMA_PATH,
};

describe('validateScenarioForManifest', () => {
  it('rejects poll scenario without ingress fixtures', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'example-echo-poll',
      agents: [{ name: 'example-echo' }],
      pollers: [{ source: 'synapse.poll.example-in-memory-heartbeat.v1' }],
    });
    expect(() =>
      validateScenarioForManifest(
        {
          id: 'example/echo-poll',
          manifests: ['example-echo-poll'],
          ingress: {
            source: 'synapse.poll.example-in-memory-heartbeat.v1',
            fixtures: [],
          },
        },
        manifest,
      ),
    ).toThrow(/ingress\.fixtures must have at least one entry/);
  });

  it('rejects fixture file paths outside fixtures/', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'example-echo',
      agents: [{ name: 'example-echo' }],
      webhooks: [{ source: 'synapse.webhooks.example-echo-ping.v1' }],
    });
    expect(() =>
      validateScenarioForManifest(
        {
          id: 'example/echo',
          manifests: ['example-echo'],
          ingress: {
            source: 'synapse.webhooks.example-echo-ping.v1',
            fixtures: [
              { file: 'examples/fixtures/example-agent-echo/ping.json' },
            ],
          },
        },
        manifest,
      ),
    ).toThrow(/fixtures\//);
  });

  it('rejects scenario not registered for manifest', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'example-echo',
      agents: [{ name: 'example-echo' }],
      webhooks: [{ source: 'synapse.webhooks.example-echo-ping.v1' }],
    });
    expect(() =>
      validateScenarioForManifest(
        {
          id: 'example/echo',
          manifests: ['example-echo-poll'],
          ingress: {
            source: 'synapse.webhooks.example-echo-ping.v1',
            fixtures: [{ file: 'fixtures/example-agent-echo/ping.json' }],
          },
        },
        manifest,
      ),
    ).toThrow(/not registered for manifest/);
  });

  it('accepts echo scenario on echo manifest', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'example-echo',
      agents: [{ name: 'example-echo' }],
      webhooks: [{ source: 'synapse.webhooks.example-echo-ping.v1' }],
    });
    const file = JSON.parse(
      readFileSync(join(repoRoot, 'scenarios/echo.scenarios.json'), 'utf8'),
    ) as { scenarios: Parameters<typeof validateScenarioForManifest>[0][] };
    expect(() =>
      validateScenarioForManifest(file.scenarios[0]!, manifest),
    ).not.toThrow();
  });
});
