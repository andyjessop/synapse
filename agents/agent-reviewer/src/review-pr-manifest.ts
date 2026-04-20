import type { GitLabMergeRequestClient } from 'adapter-gitlab';
import { createGitLabMergeRequestMockClient } from 'adapter-gitlab';
import { getRepoRoot } from 'runtime-config';
import {
  ADAPTER_FIXTURE_SCHEMA_PATHS,
  AGENT_REVIEWER_MANIFEST_AGENT_NAME,
  type GitlabFetchChangesAdapterFixture,
  loadAdapterFixturesForAgent,
  type ParsedAdapterFixture,
  type PiReviewAdapterFixture,
  parseRuntimeManifestFile,
  resolveManifestPath,
} from 'runtime-manifest';
import { z } from 'zod';

export const AGENT_REVIEWER_MANIFEST_NAME = AGENT_REVIEWER_MANIFEST_AGENT_NAME;

export type ReviewPrPiMode = 'live' | 'fixture' | 'process';

const reviewPrPiModeSchema = z.enum(['live', 'fixture', 'process']);

function isHermeticEnv(env: Record<string, string | undefined>): boolean {
  const raw = env.AGENT_REVIEWER_HERMETIC?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function parseReviewPrPiMode(
  env: Record<string, string | undefined>,
): ReviewPrPiMode {
  if (isHermeticEnv(env)) {
    return 'fixture';
  }
  const raw = env.AGENT_REVIEWER_PI_MODE?.trim();
  if (raw === undefined || raw === '') {
    return 'live';
  }
  return reviewPrPiModeSchema.parse(raw);
}

export function loadReviewPrManifestAgent(
  env: Record<string, string | undefined>,
  metaUrl: string | URL,
): {
  repoRoot: string;
  manifestPath: string;
  adapterFixtures: ParsedAdapterFixture[];
} {
  const repoRoot = getRepoRoot(metaUrl);
  const manifestPath = resolveManifestPath(repoRoot, env);
  const manifest = parseRuntimeManifestFile(manifestPath);
  const agent = manifest.agents.find(
    (row) => row.name === AGENT_REVIEWER_MANIFEST_AGENT_NAME,
  );
  if (agent === undefined) {
    throw new Error(
      `Manifest ${manifestPath} has no agent named ${AGENT_REVIEWER_MANIFEST_AGENT_NAME}`,
    );
  }
  const adapterFixtures = loadAdapterFixturesForAgent(repoRoot, agent);
  if (adapterFixtures.length === 0) {
    throw new Error(
      `Manifest ${manifestPath} agent ${AGENT_REVIEWER_MANIFEST_AGENT_NAME} requires fixtures.adapter with at least one adapter fixture path`,
    );
  }
  return {
    repoRoot,
    manifestPath,
    adapterFixtures,
  };
}

export function gitlabAdapterFixtureRules(
  rules: readonly ParsedAdapterFixture[],
): GitlabFetchChangesAdapterFixture[] {
  return rules.filter(
    (rule): rule is GitlabFetchChangesAdapterFixture =>
      rule.schema === ADAPTER_FIXTURE_SCHEMA_PATHS.GITLAB_FETCH_CHANGES,
  );
}

export function piReviewAdapterFixtureRules(
  rules: readonly ParsedAdapterFixture[],
): PiReviewAdapterFixture[] {
  return rules.filter(
    (rule): rule is PiReviewAdapterFixture =>
      rule.schema === ADAPTER_FIXTURE_SCHEMA_PATHS.PI_REVIEW,
  );
}

export function createReviewPrGitLabClient(
  adapterFixtures: readonly ParsedAdapterFixture[],
): GitLabMergeRequestClient {
  const gitlabRules = gitlabAdapterFixtureRules(adapterFixtures);
  if (gitlabRules.length === 0) {
    throw new Error(
      `No ${ADAPTER_FIXTURE_SCHEMA_PATHS.GITLAB_FETCH_CHANGES} adapter fixtures loaded for agent-reviewer`,
    );
  }
  return createGitLabMergeRequestMockClient({ rules: gitlabRules });
}

export function formatReviewPrDevStartupLine(
  env: Record<string, string | undefined>,
  metaUrl: string | URL = import.meta.url,
): string {
  const { adapterFixtures } = loadReviewPrManifestAgent(env, metaUrl);
  const piRules = piReviewAdapterFixtureRules(adapterFixtures);
  const mode = parseReviewPrPiMode(env);
  if (mode === 'fixture') {
    const count = piRules.length;
    return `agent-reviewer dev: pi=fixture (${count} pi.review adapter fixture rule(s)) — no pi.tool-call harness events`;
  }
  if (mode === 'process') {
    return 'agent-reviewer dev: pi=process (subprocess pi -p) — no pi.tool-call harness events';
  }
  return 'agent-reviewer dev: pi=live SDK (pi.tool-call harness events)';
}
