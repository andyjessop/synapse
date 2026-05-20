import { randomBytes } from 'node:crypto';

import type { ScenarioFixtureContext } from 'runtime-manifest';

const DEFAULT_TTL_MS = 5 * 60 * 1000;

type StoredContext = {
  context: ScenarioFixtureContext;
  expiresAt: number;
};

const store = new Map<string, StoredContext>();

function pruneExpired(now: number): void {
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(id);
    }
  }
}

export function installScenarioContext(
  context: ScenarioFixtureContext,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const now = Date.now();
  pruneExpired(now);
  const contextId = `scnctx_${randomBytes(12).toString('hex')}`;
  store.set(contextId, {
    context,
    expiresAt: now + ttlMs,
  });
  return contextId;
}

export function consumeScenarioContext(
  contextId: string,
): ScenarioFixtureContext {
  const now = Date.now();
  pruneExpired(now);
  const entry = store.get(contextId);
  if (entry === undefined || entry.expiresAt <= now) {
    throw new Error(`Scenario context id expired or unknown: ${contextId}`);
  }
  store.delete(contextId);
  return entry.context;
}

export function clearScenarioContextStoreForTest(): void {
  store.clear();
}
