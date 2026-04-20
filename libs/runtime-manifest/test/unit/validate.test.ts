import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  parseRuntimeManifestFile,
  parseRuntimeManifestJson,
  type RuntimeManifest,
  validateRuntimeManifest,
} from '../../src/index.js';
import { manifestDocumentBase } from '../helpers/manifest-document-base.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));
const reviewerHandler = 'agents/agent-reviewer/src/review-pr-agent.ts';
const echoHandler = 'examples/agents/example-agent-echo/src/echo-agent.ts';

describe('validateRuntimeManifest', () => {
  const knownEventTypes = new Set([
    'example.ping.v1',
    'example.pong.v1',
    'pr.received.v1',
    'pr.reviewed.v1',
  ]);
  const stubHandler = async () => {};

  function validate(
    manifest: RuntimeManifest,
    manifestPath = join(repoRoot, 'manifests/test.json'),
    resolveHandler: (handlerPath: string) => typeof stubHandler = () =>
      stubHandler,
  ) {
    return validateRuntimeManifest(manifest, {
      manifestPath,
      repoRoot,
      knownEventTypes,
      resolveHandler,
    });
  }

  it('rejects unknown event types', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'test',
      agents: [
        {
          name: 'a',
          handler: reviewerHandler,
          handles: ['unknown.event.v1'],
        },
      ],
    });
    expect(() => validate(manifest)).toThrow(/Unknown event type/);
  });

  it('rejects duplicate agent names', () => {
    const dup = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'dup',
      agents: [
        { name: 'same', handler: reviewerHandler, handles: ['pr.received.v1'] },
        { name: 'same', handler: reviewerHandler, handles: ['pr.received.v1'] },
      ],
    });
    expect(() => validate(dup)).toThrow(/Duplicate manifest agent name/);
  });

  it('rejects fixture agent mismatch', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'bad-agent',
      agents: [
        {
          name: 'agent-reviewer',
          handler: reviewerHandler,
          handles: ['pr.received.v1'],
          fixtures: {
            webhook: ['examples/fixtures/example-agent-echo/echo.fixture.json'],
            adapter: [],
          },
        },
      ],
    });
    expect(() => validate(manifest)).toThrow(/does not match manifest agent/);
  });

  it('dedupes duplicate fixture paths on the same agent', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'dup-fixture',
      agents: [
        {
          name: 'example-echo',
          handler: echoHandler,
          handles: ['example.ping.v1'],
          fixtures: {
            webhook: [
              'examples/fixtures/example-agent-echo/echo.fixture.json',
              'examples/fixtures/example-agent-echo/echo.fixture.json',
            ],
            adapter: [],
          },
        },
      ],
    });
    expect(() => validate(manifest)).not.toThrow();
  });

  it('rejects fixture ingress path not mounted by webhooks.routes', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'bad-route',
      agents: [
        {
          name: 'agent-reviewer',
          handler: reviewerHandler,
          handles: ['pr.received.v1'],
          fixtures: {
            webhook: [
              'fixtures/agent-reviewer/review-pr-gitlab-synapse.fixture.json',
            ],
            adapter: [],
          },
        },
      ],
      webhooks: { routes: ['synapse.webhooks.example-echo-ping.v1'] },
    });
    expect(() => validate(manifest)).toThrow(/not mounted/);
  });

  it('rejects agent-reviewer without fixtures.adapter', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'no-adapter',
      agents: [
        {
          name: 'agent-reviewer',
          handler: reviewerHandler,
          handles: ['pr.received.v1'],
        },
      ],
    });
    expect(() => validate(manifest)).toThrow(/fixtures\.adapter/);
  });

  it('accepts application manifest with fixtures', () => {
    const manifest = parseRuntimeManifestFile(
      join(repoRoot, 'manifests/application.json'),
    );
    expect(() =>
      validate(
        manifest,
        join(repoRoot, 'manifests/application.json'),
        (handlerPath) => {
          if (
            handlerPath === reviewerHandler &&
            existsSync(join(repoRoot, handlerPath))
          ) {
            return stubHandler;
          }
          throw new Error(`Handler not resolved: ${handlerPath}`);
        },
      ),
    ).not.toThrow();
  });
});
