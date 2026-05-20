import { getRepoRoot } from 'runtime-config';
import {
  declaredManifestWebhookRouteIds,
  parseRuntimeManifestFile,
  type ResolvedPollSource,
  type RuntimeManifest,
  resolveManifestPollSources,
  type WebhookRouteId,
} from 'runtime-manifest';

import type { ObservabilityHandle } from 'runtime-observability';
import type { RuntimePool } from 'runtime-store';

export type CreateIngressAppInput = {
  pool: RuntimePool;
  observability?: ObservabilityHandle;
  repoRoot?: string;
  redisUrl?: string;
  webhookRouteIds?: readonly WebhookRouteId[];
  manifestPath?: string;
  /** When set, skips reading pollers from manifest (tests). */
  resolvedPollSources?: ResolvedPollSource[];
  env?: NodeJS.ProcessEnv;
};

export type ResolvedIngressAppConfig = {
  repoRoot: string;
  env: NodeJS.ProcessEnv;
  webhookRouteIds: WebhookRouteId[];
  pollSources: ResolvedPollSource[];
};

/**
 * @deprecated Use {@link resolveIngressAppConfig} when resolving routes from a manifest.
 */
export function resolveWebhookRouteIdsForApp(input: {
  webhookRouteIds?: readonly WebhookRouteId[];
}): WebhookRouteId[] {
  return [...(input.webhookRouteIds ?? [])];
}

function resolveWebhookRouteIds(
  input: CreateIngressAppInput,
  manifest: RuntimeManifest | undefined,
): WebhookRouteId[] {
  if (input.webhookRouteIds !== undefined) {
    return [...input.webhookRouteIds];
  }
  if (manifest !== undefined) {
    return declaredManifestWebhookRouteIds(manifest);
  }
  return [];
}

export function resolveIngressAppConfig(
  input: CreateIngressAppInput,
  metaUrl: string | URL = import.meta.url,
): ResolvedIngressAppConfig {
  const repoRoot = input.repoRoot ?? getRepoRoot(metaUrl);
  const env = input.env ?? process.env;
  const manifest =
    input.manifestPath !== undefined
      ? parseRuntimeManifestFile(input.manifestPath)
      : undefined;

  const webhookRouteIds = resolveWebhookRouteIds(input, manifest);
  const pollSources =
    input.resolvedPollSources ??
    (manifest !== undefined ? resolveManifestPollSources(manifest) : []);

  return {
    repoRoot,
    env,
    webhookRouteIds,
    pollSources,
  };
}

export function assertPollIngressRedisUrl(
  pollSources: readonly ResolvedPollSource[],
  redisUrl: string | undefined,
): void {
  if (
    pollSources.length > 0 &&
    (redisUrl === undefined || redisUrl.trim() === '')
  ) {
    throw new Error(
      'Poll sources require redisUrl for distributed locks (set REDIS_URL or pass redisUrl to createIngressApp)',
    );
  }
}
