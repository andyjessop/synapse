import {
  createPiReviewMockClient,
  createPiReviewProcessClient,
  createPiReviewSdkClient,
} from 'pi-harness';
import { getRepoRoot } from 'runtime-config';
import type { GitLabMergeRequestClient } from './gitlab-merge-request-client.js';
import { loadPiHarnessFixture } from './load-pi-harness-fixture.js';
import type { PiReviewClient } from './pi-review-client.js';
import {
  formatReviewPrDevStartupLine,
  parseReviewPrPiMode,
} from './review-pr-manifest.js';
import {
  isReviewPrPiClientConfigured,
  setReviewPrPiClient,
} from './review-pr-pi-injection.js';

export {
  AGENT_REVIEWER_MANIFEST_NAME,
  formatReviewPrDevStartupLine,
  parseReviewPrPiMode,
  type ReviewPrPiMode,
} from './review-pr-manifest.js';

const DEFAULT_PI_FIXTURE_PATH =
  'fixtures/agent-reviewer/pi-harness/pi-review-synapse.json';

export function resolveReviewPrPiClient(input: {
  repoRoot: string;
  env: Record<string, string | undefined>;
  gitlab: GitLabMergeRequestClient;
  piFixturePath?: string;
}): PiReviewClient {
  const mode = parseReviewPrPiMode(input.env);
  if (mode === 'live') {
    return createPiReviewSdkClient({
      repoRoot: input.repoRoot,
      env: input.env,
      gitlab: input.gitlab,
    });
  }
  if (mode === 'process') {
    return createPiReviewProcessClient({
      repoRoot: input.repoRoot,
      env: input.env,
    });
  }
  const fixture = loadPiHarnessFixture(
    input.repoRoot,
    input.piFixturePath ?? DEFAULT_PI_FIXTURE_PATH,
  );
  return createPiReviewMockClient({
    repoRoot: input.repoRoot,
    markdown: fixture.markdown,
  });
}

export function configureReviewPrDevClients(
  env: Record<string, string | undefined> = process.env,
  metaUrl: string | URL = import.meta.url,
  deps: { gitlab: GitLabMergeRequestClient },
): void {
  if (isReviewPrPiClientConfigured()) {
    return;
  }
  const repoRoot = getRepoRoot(metaUrl);
  setReviewPrPiClient(
    resolveReviewPrPiClient({ repoRoot, env, gitlab: deps.gitlab }),
  );
}
