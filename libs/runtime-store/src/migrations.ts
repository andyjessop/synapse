import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { type RuntimePool } from './db';

/** Serializes migrate calls across api-runtime, worker, and tests. */
const RUNTIME_STORE_MIGRATION_ADVISORY_LOCK = 9_783_324_511n;

/**
 * Migrations table created before reading the ledger so `migrateRuntimeStoreTo` can
 * record rows even if `001_runtime_store.sql` is skipped when already applied.
 * `001_runtime_store.sql` also defines `runtime_store_migrations` with `if not exists`
 * so databases migrated with the historical inline runner stay compatible.
 */
const LEDGER_BOOTSTRAP = `
  create table if not exists runtime_store_migrations (
    id text primary key,
    applied_at timestamptz not null default now()
  )
`;

const moduleDir = dirname(fileURLToPath(import.meta.url));

const LEDGER_MIGRATION_FILES = [
  ['001_streams_runtime', '001_streams_runtime.sql'],
  ['003_agent_runs_failure_detail', '003_agent_runs_failure_detail.sql'],
  ['005_drop_obsolete_runtime_tables', '005_drop_obsolete_runtime_tables.sql'],
  [
    '006_normalize_legacy_payload_pointers',
    '006_normalize_legacy_payload_pointers.sql',
  ],
  ['007_events_traceparent', '007_events_traceparent.sql'],
] as const;

export type LedgerMigrationId = (typeof LEDGER_MIGRATION_FILES)[number][0];

function resolveLedgerDir(): string {
  const marker = LEDGER_MIGRATION_FILES[0]![1];
  const candidates = [
    join(moduleDir, '../drizzle/ledger'),
    ...(process.env.RUNTIME_STORE_LEDGER_DIR !== undefined &&
    process.env.RUNTIME_STORE_LEDGER_DIR !== ''
      ? [process.env.RUNTIME_STORE_LEDGER_DIR]
      : []),
    join(process.cwd(), 'drizzle/ledger'),
    join(process.cwd(), 'libs/runtime-store/drizzle/ledger'),
  ];
  for (const base of candidates) {
    if (existsSync(join(base, marker))) {
      return base;
    }
  }
  throw new Error(
    `runtime-store migration ledger not found (expected ${marker} next to this package). Tried: ${candidates.join(', ')}. Set RUNTIME_STORE_LEDGER_DIR if the ledger lives elsewhere (e.g. after copying assets into a bundle).`,
  );
}

type LoadedMigration = {
  readonly id: LedgerMigrationId;
  readonly sql: string;
};

let ledgerMigrationsCache: ReadonlyArray<LoadedMigration> | undefined;

function loadLedgerMigrations(): ReadonlyArray<LoadedMigration> {
  const ledgerDir = resolveLedgerDir();
  return LEDGER_MIGRATION_FILES.map(([id, file]) => ({
    id: id as LedgerMigrationId,
    sql: readFileSync(join(ledgerDir, file), 'utf8'),
  }));
}

/** SQL ledger is read from disk only when migration runs (not at package import time). */
function getLedgerMigrations(): ReadonlyArray<LoadedMigration> {
  ledgerMigrationsCache ??= loadLedgerMigrations();
  return ledgerMigrationsCache;
}

export const LAST_RUNTIME_STORE_MIGRATION_ID: LedgerMigrationId =
  LEDGER_MIGRATION_FILES[LEDGER_MIGRATION_FILES.length - 1]![0];

export function assertKnownMigrationId(id: string): LedgerMigrationId {
  const found = LEDGER_MIGRATION_FILES.find(([mid]) => mid === id);
  if (found === undefined) {
    throw new Error(`Unknown runtime-store migration id: ${id}`);
  }
  return found[0];
}

/**
 * Applies packaged migrations through `lastMigrationId` (inclusive), in order.
 * Use in tests to simulate upgrade paths; production should call {@link migrateRuntimeStore}.
 */
async function withClientTransaction<T>(
  client: pg.PoolClient,
  run: () => Promise<T>,
): Promise<T> {
  await client.query('begin');
  try {
    const result = await run();
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // ignore rollback errors while handling the original failure
    }
    throw error;
  }
}

async function withMigrationAdvisoryLock<T>(
  pool: RuntimePool,
  run: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1::bigint)', [
      RUNTIME_STORE_MIGRATION_ADVISORY_LOCK.toString(),
    ]);
    try {
      return await run(client);
    } finally {
      await client.query('select pg_advisory_unlock($1::bigint)', [
        RUNTIME_STORE_MIGRATION_ADVISORY_LOCK.toString(),
      ]);
    }
  } finally {
    client.release();
  }
}

export async function migrateRuntimeStoreTo(
  pool: RuntimePool,
  lastMigrationId: string,
): Promise<void> {
  const endId = assertKnownMigrationId(lastMigrationId);
  const migrations = getLedgerMigrations();
  const endIndex = LEDGER_MIGRATION_FILES.findIndex(([id]) => id === endId);

  await withMigrationAdvisoryLock(pool, async (client) => {
    await withClientTransaction(client, async () => {
      await client.query(LEDGER_BOOTSTRAP);
    });

    for (let i = 0; i <= endIndex; i++) {
      const migration = migrations[i]!;
      await withClientTransaction(client, async () => {
        const existing = await client.query(
          'select 1 from runtime_store_migrations where id = $1',
          [migration.id],
        );
        if (existing.rowCount === 0) {
          await client.query(migration.sql);
          await client.query(
            'insert into runtime_store_migrations (id) values ($1)',
            [migration.id],
          );
        }
      });
    }
  });
}

export async function migrateRuntimeStore(pool: RuntimePool): Promise<void> {
  await migrateRuntimeStoreTo(pool, LAST_RUNTIME_STORE_MIGRATION_ID);
}

/** @internal */
export function __testingLedgerMigrations(): ReadonlyArray<{
  readonly id: string;
  readonly sql: string;
}> {
  return getLedgerMigrations();
}

/** @internal */
export function __testingMigrationOrdering(): LedgerMigrationId[] {
  return getLedgerMigrations().map((m) => m.id);
}
