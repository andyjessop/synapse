import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  parseRuntimeManifestFile,
  parseRuntimeManifestJson,
  runtimeManifestSchema,
} from '../../src/index.js';
import { manifestDocumentBase } from '../helpers/manifest-document-base.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('runtimeManifestSchema', () => {
  it('parses shipped manifests', () => {
    for (const rel of [
      'manifests/application.json',
      'manifests/examples/echo.json',
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
        agents: [
          { name: 'a', handler: 'agents/x.ts', handles: ['example.ping.v1'] },
        ],
      }),
    ).toThrow();
  });

  it('rejects unknown top-level keys', () => {
    expect(() =>
      runtimeManifestSchema.parse({
        ...manifestDocumentBase,
        name: 'x',
        agents: [
          { name: 'a', handler: 'agents/x.ts', handles: ['example.ping.v1'] },
        ],
        enabled: true,
      }),
    ).toThrow();
  });

  it('rejects empty handles array', () => {
    expect(() =>
      runtimeManifestSchema.parse({
        ...manifestDocumentBase,
        name: 'x',
        agents: [{ name: 'a', handler: 'agents/x.ts', handles: [] }],
      }),
    ).toThrow();
  });

  it('rejects agent fields beyond name, handler, handles, fixtures', () => {
    expect(() =>
      runtimeManifestSchema.parse({
        ...manifestDocumentBase,
        name: 'x',
        agents: [
          {
            name: 'a',
            handler: 'agents/x.ts',
            handles: ['example.ping.v1'],
            emits: ['example.pong.v1'],
          },
        ],
      }),
    ).toThrow();
  });

  it('accepts fixtures.webhook and fixtures.adapter on agent rows', () => {
    const parsed = runtimeManifestSchema.parse({
      ...manifestDocumentBase,
      name: 'x',
      agents: [
        {
          name: 'agent-reviewer',
          handler: 'agents/agent-reviewer/src/review-pr-agent.ts',
          handles: ['pr.received.v1'],
          fixtures: {
            webhook: [
              'fixtures/agent-reviewer/review-pr-gitlab-synapse.fixture.json',
            ],
            adapter: [
              'fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json',
            ],
          },
        },
      ],
    });
    expect(parsed.agents[0]?.fixtures?.adapter[0]).toContain(
      'gitlab-fetch-changes',
    );
  });

  it('rejects legacy adapterFixtures on agent rows', () => {
    expect(() =>
      runtimeManifestSchema.parse({
        ...manifestDocumentBase,
        name: 'x',
        agents: [
          {
            name: 'agent-reviewer',
            handler: 'agents/agent-reviewer/src/review-pr-agent.ts',
            handles: ['pr.received.v1'],
            adapterFixtures: {
              gitlabChanges: 'fixtures/agent-reviewer/legacy-gitlab.json',
              piReview: 'fixtures/agent-reviewer/legacy-pi.md',
            },
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects legacy fixtures string array on agent rows', () => {
    expect(() =>
      runtimeManifestSchema.parse({
        ...manifestDocumentBase,
        name: 'x',
        agents: [
          {
            name: 'a',
            handler: 'agents/x.ts',
            handles: ['example.ping.v1'],
            fixtures: [
              'examples/fixtures/example-agent-echo/echo.fixture.json',
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects webhooks.fixtures on manifest', () => {
    expect(() =>
      runtimeManifestSchema.parse({
        ...manifestDocumentBase,
        name: 'x',
        agents: [
          {
            name: 'a',
            handler: 'agents/x.ts',
            handles: ['example.ping.v1'],
          },
        ],
        webhooks: {
          routes: ['synapse.webhooks.prs.v1'],
          fixtures: ['review-pr/gitlab-synapse'],
        },
      }),
    ).toThrow();
  });
});
