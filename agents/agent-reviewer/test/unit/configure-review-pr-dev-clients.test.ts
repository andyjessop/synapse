import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  configureReviewPrDevClients,
  resolveReviewPrPiClient,
} from '../../src/configure-review-pr-dev-clients.js';
import { parseReviewPrPiMode } from '../../src/review-pr-manifest.js';
import {
  getReviewPrPiClient,
  resetReviewPrPiClientForTest,
  setReviewPrPiClient,
} from '../../src/review-pr-pi-injection.js';

const createPiReviewSdkClient = vi.hoisted(() => vi.fn());
const createPiReviewMockClient = vi.hoisted(() => vi.fn());
const createPiReviewProcessClient = vi.hoisted(() => vi.fn());

vi.mock('pi-harness', () => ({
  createPiReviewSdkClient,
  createPiReviewMockClient,
  createPiReviewProcessClient,
}));

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));
const gitlab = { fetchChanges: vi.fn() };

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

describe('resolveReviewPrPiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPiReviewSdkClient.mockReturnValue({ repoRoot, review: vi.fn() });
    createPiReviewMockClient.mockReturnValue({ repoRoot, review: vi.fn() });
    createPiReviewProcessClient.mockReturnValue({ repoRoot, review: vi.fn() });
  });

  it('uses live Pi SDK by default', () => {
    resolveReviewPrPiClient({ repoRoot, env: {}, gitlab });
    expect(createPiReviewSdkClient).toHaveBeenCalledWith(
      expect.objectContaining({ gitlab }),
    );
  });

  it('uses pi mock client when hermetic', () => {
    resolveReviewPrPiClient({
      repoRoot,
      env: { AGENT_REVIEWER_HERMETIC: 'yes' },
      gitlab,
    });
    expect(createPiReviewMockClient).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: expect.any(String) }),
    );
  });
});

describe('configureReviewPrDevClients', () => {
  it('respects an existing injected client', () => {
    resetReviewPrPiClientForTest();
    const custom = { repoRoot: '/x', review: vi.fn() };
    setReviewPrPiClient(custom);
    configureReviewPrDevClients({}, import.meta.url, { gitlab });
    expect(getReviewPrPiClient()).toBe(custom);
    resetReviewPrPiClientForTest();
  });
});
