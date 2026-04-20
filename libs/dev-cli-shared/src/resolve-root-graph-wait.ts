const DEFAULT_POLL_MS = 500;

function parsePositiveIntMs(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  return Math.floor(n);
}

/**
 * Optional cap for {@link waitForRootGraphOutcome} when `maxPolls` is not passed.
 * Unset means poll until a terminal event or failed run (unbounded).
 */
export function resolveRootGraphWaitMaxMs(
  env: Record<string, string | undefined> = process.env,
): number | undefined {
  return (
    parsePositiveIntMs(env.DEV_ONCE_MAX_WAIT_MS) ??
    parsePositiveIntMs(env.DEV_WEBHOOK_MAX_WAIT_MS)
  );
}

export function resolveRootGraphWaitPollMs(
  env: Record<string, string | undefined> = process.env,
): number {
  return (
    parsePositiveIntMs(env.DEV_ONCE_POLL_MS) ??
    parsePositiveIntMs(env.DEV_WEBHOOK_POLL_MS) ??
    DEFAULT_POLL_MS
  );
}

export function resolveRootGraphWaitPollParams(
  env: Record<string, string | undefined> = process.env,
): { maxPolls: number | undefined; pollMs: number; maxMs: number | undefined } {
  const pollMs = resolveRootGraphWaitPollMs(env);
  const maxMs = resolveRootGraphWaitMaxMs(env);
  const maxPolls =
    maxMs === undefined ? undefined : Math.max(1, Math.ceil(maxMs / pollMs));
  return { maxPolls, pollMs, maxMs };
}
