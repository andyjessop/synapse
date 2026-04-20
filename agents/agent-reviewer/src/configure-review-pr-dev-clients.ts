import type { GitLabMergeRequestClient } from 'adapter-gitlab';
import {
  createPiReviewMockClient,
  createPiReviewProcessClient,
  createPiReviewSdkClient,
} from 'pi-harness';

import type { PiReviewClient } from './pi-review-client.js';
import {
  createReviewPrGitLabClient,
  formatReviewPrDevStartupLine,
  loadReviewPrManifestAgent,
  parseReviewPrPiMode,
  piReviewAdapterFixtureRules,
} from './review-pr-manifest.js';
import {
  isReviewPrPiClientConfigured,
  setReviewPrPiClient,
} from './review-pr-pi-injection.js';

export {
  AGENT_REVIEWER_MANIFEST_NAME,
  formatReviewPrDevStartupLine,
  loadReviewPrManifestAgent,
  parseReviewPrPiMode,
  type ReviewPrPiMode,
} from './review-pr-manifest.js';

export function resolveReviewPrDevClients(
  env: Record<string, string | undefined>,
  metaUrl: string | URL,
): { pi: PiReviewClient; gitlab: GitLabMergeRequestClient } {
  const { repoRoot, adapterFixtures } = loadReviewPrManifestAgent(env, metaUrl);
  const gitlab = createReviewPrGitLabClient(adapterFixtures);
  const mode = parseReviewPrPiMode(env);
  let pi: PiReviewClient;
  if (mode === 'live') {
    pi = createPiReviewSdkClient({ repoRoot, env, gitlab });
  } else if (mode === 'process') {
    pi = createPiReviewProcessClient({ repoRoot, env });
  } else {
    const piRules = piReviewAdapterFixtureRules(adapterFixtures);
    pi = createPiReviewMockClient({ repoRoot, rules: piRules });
  }
  return { pi, gitlab };
}

export function configureReviewPrDevClients(
  env: Record<string, string | undefined> = process.env,
  metaUrl: string | URL = import.meta.url,
): void {
  if (isReviewPrPiClientConfigured()) {
    return;
  }
  setReviewPrPiClient(resolveReviewPrDevClients(env, metaUrl).pi);
}
