import Database from 'better-sqlite3';

export type SqliteDatabase = InstanceType<typeof Database>;

const handleCache = new Map<string, SqliteDatabase>();
const openingByAgent = new Map<string, Promise<SqliteDatabase>>();

/** Returns cached DB only if present and still open (better-sqlite3 `open` flag). */
export function getValidCachedHandle(
  agentName: string,
): SqliteDatabase | undefined {
  const db = handleCache.get(agentName);
  if (db === undefined) {
    return undefined;
  }
  if (!db.open) {
    handleCache.delete(agentName);
    return undefined;
  }
  return db;
}

export function setCachedHandle(agentName: string, db: SqliteDatabase): void {
  handleCache.set(agentName, db);
}

/**
 * Ensures at most one in-flight open+migrate per `agentName` in this process.
 * All waiters share the same promise.
 */
export function takeOrCreateOpeningPromise(
  agentName: string,
  factory: () => Promise<SqliteDatabase>,
): Promise<SqliteDatabase> {
  const existing = openingByAgent.get(agentName);
  if (existing !== undefined) {
    return existing;
  }
  /** Register in-flight promise before the factory’s first `await` (single-flight). */
  const created = (async () => {
    try {
      return await factory();
    } finally {
      openingByAgent.delete(agentName);
    }
  })();
  openingByAgent.set(agentName, created);
  return created;
}

export function evictAgentSqliteHandle(agentName: string): void {
  const db = handleCache.get(agentName);
  if (db !== undefined) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    handleCache.delete(agentName);
  }
}

/**
 * Closes every cached DB and clears in-flight open promises. This does not
 * cancel an `openMigrateAndCache` already running; callers should invoke this
 * only after active reactor jobs that use SQLite have finished (e.g. worker
 * shutdown after the BullMQ worker stops accepting work).
 */
export function closeAllAgentSqliteHandles(): void {
  for (const [name, db] of handleCache) {
    void name;
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
  handleCache.clear();
  openingByAgent.clear();
}

/** Test-only: reset process-local caches. */
export function __testingResetAgentSqliteHandleCaches(): void {
  handleCache.clear();
  openingByAgent.clear();
}
