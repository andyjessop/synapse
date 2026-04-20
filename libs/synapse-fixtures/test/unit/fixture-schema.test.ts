import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRuntimeManifestFile } from 'runtime-manifest';
import { describe, expect, it } from 'vitest';
import {
  parseSynapseFixtureFile,
  resolveFixtureById,
} from '../../src/index.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('synapse fixtures', () => {
  it('parses reviewer and echo fixture files', () => {
    const reviewer = parseSynapseFixtureFile(
      repoRoot,
      'fixtures/agent-reviewer/review-pr-gitlab-synapse.fixture.json',
    );
    expect(reviewer.id).toBe('review-pr/gitlab-synapse');

    const echo = parseSynapseFixtureFile(
      repoRoot,
      'examples/fixtures/example-agent-echo/echo.fixture.json',
    );
    expect(echo.ingress.kind).toBe('webhook');
  });

  it('resolves fixture by id from manifest', () => {
    const manifest = parseRuntimeManifestFile(
      join(repoRoot, 'manifests/application.json'),
    );
    const resolved = resolveFixtureById(
      manifest,
      repoRoot,
      'review-pr/gitlab-synapse',
    );
    expect(resolved.agentName).toBe('agent-reviewer');
  });

  it('parses reviewer fixture without routeSet', () => {
    const fixture = parseSynapseFixtureFile(
      repoRoot,
      'fixtures/agent-reviewer/review-pr-gitlab-synapse.fixture.json',
    );
    expect(fixture.ingress.path).toBe('/v1/prs');
  });
});
