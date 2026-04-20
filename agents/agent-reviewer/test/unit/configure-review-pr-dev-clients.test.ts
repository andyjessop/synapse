import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  configureReviewPrDevClients,
  resolveReviewPrDevClients,
} from '../../src/configure-review-pr-dev-clients.js';
import {
  loadReviewPrManifestAgent,
  parseReviewPrPiMode,
} from '../../src/review-pr-manifest.js';
import {
  getReviewPrPiClient,
  resetReviewPrPiClientForTest,
  setReviewPrPiClient,
} from '../../src/review-pr-pi-injection.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));
const applicationManifest = join(repoRoot, 'manifests/application.json');

const createPiReviewSdkClient = vi.hoisted(() => vi.fn());
const createPiReviewMockClient = vi.hoisted(() => vi.fn());
const createPiReviewProcessClient = vi.hoisted(() => vi.fn());
const createGitLabMergeRequestMockClient = vi.hoisted(() => vi.fn());

vi.mock('pi-harness', () => ({
  createPiReviewSdkClient,
  createPiReviewMockClient,
  createPiReviewProcessClient,
}));

vi.mock('adapter-gitlab', () => ({
  createGitLabMergeRequestMockClient,
}));

function envWithManifest(
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    SYNAPSE_RUNTIME_MANIFEST: applicationManifest,
    ...extra,
  };
}

describe('loadReviewPrManifestAgent', () => {
  it('returns parsed adapter fixtures from the manifest', () => {
    const loaded = loadReviewPrManifestAgent(
      envWithManifest(),
      import.meta.url,
    );
    expect(loaded.adapterFixtures.length).toBe(2);
    expect(loaded.adapterFixtures.map((f) => f.adapter).sort()).toEqual([
      'gitlab',
      'pi',
    ]);
    expect(loaded.manifestPath).toBe(applicationManifest);
  });

  it('throws when agent-reviewer lacks fixtures.adapter', () => {
    const abs = join(
      repoRoot,
      'agents/agent-reviewer/test/fixtures/manifest-no-adapter.json',
    );
    expect(() =>
      loadReviewPrManifestAgent(
        { SYNAPSE_RUNTIME_MANIFEST: abs },
        import.meta.url,
      ),
    ).toThrow(/fixtures\.adapter/);
  });
});

describe('parseReviewPrPiMode', () => {
  it('defaults to live', () => {
    expect(parseReviewPrPiMode({})).toBe('live');
  });

  it('returns fixture when hermetic', () => {
    expect(parseReviewPrPiMode({ AGENT_REVIEWER_HERMETIC: '1' })).toBe(
      'fixture',
    );
  });

  it('parses AGENT_REVIEWER_PI_MODE', () => {
    expect(parseReviewPrPiMode({ AGENT_REVIEWER_PI_MODE: 'process' })).toBe(
      'process',
    );
  });
});

describe('resolveReviewPrDevClients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPiReviewSdkClient.mockReturnValue({ repoRoot, review: vi.fn() });
    createPiReviewMockClient.mockReturnValue({ repoRoot, review: vi.fn() });
    createPiReviewProcessClient.mockReturnValue({ repoRoot, review: vi.fn() });
    createGitLabMergeRequestMockClient.mockReturnValue({
      fetchChanges: vi.fn(),
    });
  });

  it('uses live Pi SDK and gitlab mock rules by default', () => {
    const { adapterFixtures } = loadReviewPrManifestAgent(
      envWithManifest(),
      import.meta.url,
    );
    resolveReviewPrDevClients(envWithManifest(), import.meta.url);
    expect(createGitLabMergeRequestMockClient).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: expect.arrayContaining([
          expect.objectContaining({
            adapter: 'gitlab',
            method: 'fetchChanges',
          }),
        ]),
      }),
    );
    expect(createGitLabMergeRequestMockClient.mock.calls[0]?.[0].rules).toEqual(
      adapterFixtures.filter((r) => r.adapter === 'gitlab'),
    );
    expect(createPiReviewSdkClient).toHaveBeenCalled();
  });

  it('uses pi mock client when hermetic', () => {
    const { adapterFixtures } = loadReviewPrManifestAgent(
      envWithManifest(),
      import.meta.url,
    );
    resolveReviewPrDevClients(
      envWithManifest({ AGENT_REVIEWER_HERMETIC: 'yes' }),
      import.meta.url,
    );
    expect(createPiReviewMockClient).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: adapterFixtures.filter((r) => r.adapter === 'pi'),
      }),
    );
  });
});

describe('configureReviewPrDevClients', () => {
  it('respects an existing injected client', () => {
    resetReviewPrPiClientForTest();
    const custom = { repoRoot: '/x', review: vi.fn() };
    setReviewPrPiClient(custom);
    configureReviewPrDevClients(envWithManifest(), import.meta.url);
    expect(getReviewPrPiClient()).toBe(custom);
    resetReviewPrPiClientForTest();
  });
});
