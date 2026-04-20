import { readdirSync } from 'node:fs';
import { join } from 'node:path';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Latest `tmp/dev/runs/<timestamp>_<inputEventId>.json` for `inputEventId`, if any.
 */
export function findLatestDevRunSnapshotRelativePath(
  repoRoot: string,
  inputEventId: string,
): string | undefined {
  const dir = join(repoRoot, 'tmp', 'dev', 'runs');
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return undefined;
  }
  const suffix = `_${inputEventId}.json`;
  const matches = entries.filter((name) => name.endsWith(suffix));
  if (matches.length === 0) {
    return undefined;
  }
  matches.sort();
  return join('tmp', 'dev', 'runs', matches[matches.length - 1]!);
}

/**
 * Polls until the ingress snapshot file exists (written by `apps/webhooks` in the background).
 */
export async function waitForLatestDevRunSnapshotRelativePath(
  repoRoot: string,
  inputEventId: string,
  options?: { maxPolls?: number; pollMs?: number },
): Promise<string | undefined> {
  const maxPolls = options?.maxPolls ?? 60;
  const pollMs = options?.pollMs ?? 500;
  for (let i = 0; i < maxPolls; i += 1) {
    const path = findLatestDevRunSnapshotRelativePath(repoRoot, inputEventId);
    if (path !== undefined) {
      return path;
    }
    await delay(pollMs);
  }
  return findLatestDevRunSnapshotRelativePath(repoRoot, inputEventId);
}
