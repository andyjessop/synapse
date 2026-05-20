import { getRepoRoot } from 'runtime-config';
import {
  AGENT_REVIEWER_MANIFEST_AGENT_NAME,
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

export function formatReviewPrDevStartupLine(
  env: Record<string, string | undefined>,
  _metaUrl: string | URL = import.meta.url,
): string {
  const mode = parseReviewPrPiMode(env);
  if (mode === 'fixture') {
    return 'agent-reviewer dev: pi=fixture (pi-harness JSON) — GitLab via ctx.adapters';
  }
  if (mode === 'process') {
    return 'agent-reviewer dev: pi=process (subprocess pi -p)';
  }
  return 'agent-reviewer dev: pi=live SDK — GitLab via ctx.adapters';
}

export function loadReviewPrManifestPath(
  env: Record<string, string | undefined>,
  metaUrl: string | URL,
): { repoRoot: string; manifestPath: string } {
  const repoRoot = getRepoRoot(metaUrl);
  const manifestPath = resolveManifestPath(repoRoot, env);
  return { repoRoot, manifestPath };
}
