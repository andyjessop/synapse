import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  parseRuntimeManifestFile,
  runtimeManifestSchema,
} from '../../src/index.js';
import { manifestDocumentBase } from '../helpers/manifest-document-base.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('runtimeManifestSchema', () => {
  it('parses shipped manifests', () => {
    for (const rel of [
      'manifests/application.json',
      'manifests/examples/echo.json',
      'manifests/examples/echo-poll.json',
      'manifests/examples/all.json',
      'manifests/debug/reviewer-only.json',
    ]) {
      expect(parseRuntimeManifestFile(join(repoRoot, rel)).name).toBeTruthy();
    }
  });

  it('requires schema to match MANIFEST_SCHEMA_PATH', () => {
    expect(() =>
      runtimeManifestSchema.parse({
        ...manifestDocumentBase,
        schema: 'libs/runtime-manifest/schemas/manifest/other.schema.json',
        name: 'x',
        agents: [{ name: 'example-echo' }],
      }),
    ).toThrow();
  });

  it('rejects unknown top-level keys', () => {
    expect(() =>
      runtimeManifestSchema.parse({
        ...manifestDocumentBase,
        name: 'x',
        agents: [{ name: 'example-echo' }],
        enabled: true,
      }),
    ).toThrow();
  });

  it('rejects agents[].handler and agents[].handles', () => {
    expect(() =>
      runtimeManifestSchema.parse({
        ...manifestDocumentBase,
        name: 'x',
        agents: [
          {
            name: 'example-echo',
            handler: 'examples/agents/example-agent-echo/src/echo-agent.ts',
            handles: ['example.ping.v1'],
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects agents[].fixtures', () => {
    expect(() =>
      runtimeManifestSchema.parse({
        ...manifestDocumentBase,
        name: 'x',
        agents: [
          {
            name: 'example-echo',
            fixtures: {
              webhook: [
                'examples/fixtures/example-agent-echo/echo.fixture.json',
              ],
            },
          },
        ],
      }),
    ).toThrow();
  });

  it('accepts webhooks and pollers as source arrays', () => {
    const parsed = runtimeManifestSchema.parse({
      ...manifestDocumentBase,
      name: 'x',
      agents: [{ name: 'example-echo' }],
      webhooks: [{ source: 'synapse.webhooks.example-echo-ping.v1' }],
      pollers: [
        {
          source: 'synapse.poll.example-in-memory-heartbeat.v1',
          intervalMs: 60_000,
        },
      ],
    });
    expect(parsed.webhooks?.[0]?.source).toBe(
      'synapse.webhooks.example-echo-ping.v1',
    );
    expect(parsed.pollers?.[0]?.source).toBe(
      'synapse.poll.example-in-memory-heartbeat.v1',
    );
  });
});
