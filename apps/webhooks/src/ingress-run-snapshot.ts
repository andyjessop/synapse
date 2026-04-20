import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  gatherDevOnceRunRecord,
  retryDevFailedRunsOnRoot,
  waitForRootGraphOutcome,
} from 'dev-cli-shared';
import {
  devRunSnapshotArtifactFileName,
  formatDevJsonFileBody,
  type RuntimePool,
  selectEventById,
} from 'runtime-store';

function shouldSkipBackgroundSnapshots(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

/**
 * After an ingress hit returns 202, schedules one durable **full graph** snapshot
 * (`DevOnceRunRecord`, same shape as historical `tmp/dev-once/runs/*.json`) under
 * `tmp/dev/runs/<YYYYMMDDHHmmss>_<inputEventId>.json` — **one file per ingress**
 * (timestamp prefix for sort order, then root input event id).
 *
 * Waits for `terminalEventTypes` (or root agent failure) up to the default poll window,
 * then gathers whatever graph exists (partial if worker is slow or down).
 */
export function scheduleIngressRunSnapshot(input: {
  pool: RuntimePool;
  repoRoot: string;
  redisUrl?: string;
  /** Durable id of the ingress-emitted root event (`evt_…`). */
  inputEventId: string;
  /** `scenarioId` stored on the record (e.g. `ingress:POST /v1/prs`). */
  scenarioId: string;
  terminalEventTypes: readonly string[];
}): void {
  if (shouldSkipBackgroundSnapshots()) {
    return;
  }
  const {
    pool,
    repoRoot,
    redisUrl,
    inputEventId,
    scenarioId,
    terminalEventTypes,
  } = input;
  void (async () => {
    try {
      const rootEvent = await selectEventById(pool, inputEventId);
      if (rootEvent === undefined) {
        return;
      }
      if (redisUrl !== undefined && redisUrl.trim() !== '') {
        await retryDevFailedRunsOnRoot({
          pool,
          redisUrl,
          rootId: rootEvent.rootId,
        });
      }
      await waitForRootGraphOutcome({
        pool,
        rootId: rootEvent.rootId,
        terminalEventTypes,
      });
      const latest = await selectEventById(pool, inputEventId);
      if (latest === undefined) {
        return;
      }
      const recordedAt = new Date();
      const record = await gatherDevOnceRunRecord(
        pool,
        scenarioId,
        latest,
        recordedAt,
      );
      const dir = join(repoRoot, 'tmp', 'dev', 'runs');
      mkdirSync(dir, { recursive: true });
      const path = join(
        dir,
        devRunSnapshotArtifactFileName(inputEventId, recordedAt),
      );
      writeFileSync(path, formatDevJsonFileBody(record), 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `[webhooks] ingress run snapshot failed (${inputEventId}): ${message}\n`,
      );
    }
  })();
}
