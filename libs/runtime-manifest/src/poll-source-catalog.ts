import { z } from 'zod';

import type { RuntimeManifest } from './manifest-schema.js';

/** Authoritative catalog of poll ingress sources (ids, defaults, lock keys). Registration lives in `apps/ingress`. */
export const POLL_SOURCE_CATALOG = {
  'synapse.poll.example-in-memory-heartbeat.v1': {
    description:
      'In-memory curriculum poll source (infrastructure only; not a vendor poll pattern)',
    owner: 'example-echo',
    defaultIntervalMs: 60_000,
    defaultLockTtlMs: 55_000,
    lockKey: 'synapse:poll:synapse.poll.example-in-memory-heartbeat.v1',
  },
} as const;

export type PollSourceId = keyof typeof POLL_SOURCE_CATALOG;

export type PollSourceCatalogEntry = (typeof POLL_SOURCE_CATALOG)[PollSourceId];

const pollSourceIdTuple = Object.keys(POLL_SOURCE_CATALOG) as [
  PollSourceId,
  ...PollSourceId[],
];

export const pollSourceIdSchema = z.enum(pollSourceIdTuple);

const MIN_POLL_INTERVAL_MS = 10_000;
const DEFAULT_LOCK_GAP_MS = 5_000;

export type ResolvedPollSource = {
  id: PollSourceId;
  intervalMs: number;
  lockTtlMs: number;
  lockKey: string;
  enabled: boolean;
  params: Record<string, unknown>;
  owner: string;
};

export type PollSourceManifestEntry = {
  source: PollSourceId;
  intervalMs?: number;
  lockTtlMs?: number;
  enabled?: boolean;
  params?: Record<string, unknown>;
};

function effectiveLockTtlMs(
  entry: PollSourceManifestEntry,
  catalog: PollSourceCatalogEntry,
  effectiveIntervalMs: number,
): number {
  if (entry.lockTtlMs !== undefined) {
    return entry.lockTtlMs;
  }
  if (catalog.defaultLockTtlMs >= effectiveIntervalMs) {
    return effectiveIntervalMs - DEFAULT_LOCK_GAP_MS;
  }
  return catalog.defaultLockTtlMs;
}

export function resolveManifestPollSources(
  manifest: RuntimeManifest,
): ResolvedPollSource[] {
  const sources = manifest.pollers ?? [];
  const seen = new Set<PollSourceId>();
  const resolved: ResolvedPollSource[] = [];

  for (const entry of sources) {
    if (seen.has(entry.source)) {
      throw new Error(`Duplicate poll source id in manifest: ${entry.source}`);
    }
    seen.add(entry.source);

    const catalog = POLL_SOURCE_CATALOG[entry.source];
    if (catalog === undefined) {
      throw new Error(`Unknown poll source id in manifest: ${entry.source}`);
    }

    const ownerAgent = manifest.agents.find((a) => a.name === catalog.owner);
    if (ownerAgent === undefined) {
      throw new Error(
        `Poll source ${entry.source} owner ${catalog.owner} is not a manifest agent`,
      );
    }

    const intervalMs = entry.intervalMs ?? catalog.defaultIntervalMs;
    if (intervalMs < MIN_POLL_INTERVAL_MS) {
      throw new Error(
        `Poll source ${entry.source} intervalMs must be >= ${MIN_POLL_INTERVAL_MS}`,
      );
    }

    const lockTtlMs = effectiveLockTtlMs(entry, catalog, intervalMs);
    if (lockTtlMs >= intervalMs) {
      throw new Error(
        `Poll source ${entry.source} lockTtlMs (${lockTtlMs}) must be < intervalMs (${intervalMs})`,
      );
    }

    if (catalog.defaultLockTtlMs >= catalog.defaultIntervalMs) {
      throw new Error(
        `Poll catalog ${entry.source} defaultLockTtlMs must be < defaultIntervalMs`,
      );
    }

    resolved.push({
      id: entry.source,
      intervalMs,
      lockTtlMs,
      lockKey: catalog.lockKey,
      enabled: entry.enabled ?? true,
      params: entry.params ?? {},
      owner: catalog.owner,
    });
  }

  return resolved;
}

export function fixturePollIngressIsMounted(
  ingress: { source: PollSourceId },
  manifest: RuntimeManifest,
): boolean {
  const sources = manifest.pollers ?? [];
  return sources.some(
    (s) => s.source === ingress.source && (s.enabled ?? true) !== false,
  );
}

export function manifestListsPollSources(manifest: RuntimeManifest): boolean {
  return (manifest.pollers?.length ?? 0) > 0;
}

export function manifestShouldMountIngress(manifest: RuntimeManifest): boolean {
  const hasWebhooks = (manifest.webhooks?.length ?? 0) > 0;
  const hasPollers = (manifest.pollers?.length ?? 0) > 0;
  return hasWebhooks || hasPollers;
}
