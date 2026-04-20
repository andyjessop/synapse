import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Tracer } from '@opentelemetry/api';
import Database from 'better-sqlite3';
import type { Pool, PoolClient } from 'pg';
import type {
  AgentSqliteDb,
  RunFailureDetail,
  SqliteMigration,
} from 'runtime-agent';
import { runWithRuntimeSpan } from 'runtime-observability';
import { computeAgentSqliteAdvisoryLockInts } from './advisory-key';
import {
  releaseAgentSqliteAdvisoryLock,
  tryAcquireAgentSqliteAdvisoryLockWithTimeout,
} from './advisory-lock';
import {
  computeMigrationBundleHash,
  computeNormalizedMigrationSqlHash,
} from './bundle-hash';
import {
  rethrowAsClassifiedAgentSqliteError,
  type SqlitePhase,
} from './classify';
import { createAgentSqliteDb } from './create-db';
import { AgentSqliteRuntimeError } from './errors';
import {
  containsReservedAgentSqliteTable,
  migrationSqlContainsTransactionControl,
} from './guards';
import {
  evictAgentSqliteHandle,
  getValidCachedHandle,
  type SqliteDatabase,
  setCachedHandle,
  takeOrCreateOpeningPromise,
} from './handle-cache';
import { resolveAgentSqliteFilePath } from './paths';
import { readSqliteErrorCode } from './sqlite-codes';

const CREATE_METADATA = `create table if not exists __agent_sqlite_metadata (
  key text primary key,
  value text not null
)`;

const CREATE_MIGRATIONS = `create table if not exists __agent_sqlite_migrations (
  id text primary key,
  position integer not null unique,
  hash text not null,
  applied_at text not null
)`;

type LedgerRow = {
  id: string;
  position: number;
  hash: string;
  applied_at: string;
};

function driftDetail(
  agentName: string,
  reactorName: string,
  bundleHash: string,
  message: string,
): RunFailureDetail {
  return {
    kind: 'agent_sqlite_migration_drift',
    retryable: false,
    subsystem: 'agent_sqlite',
    agentName,
    reactorName,
    bundleHash,
    message: `agent_sqlite_migration_drift: ${message}`,
  };
}

function assertCoreTables(db: SqliteDatabase): void {
  const rows = db
    .prepare(
      `select name from sqlite_master where type = 'table' and name in ('__agent_sqlite_metadata', '__agent_sqlite_migrations')`,
    )
    .all() as { name: string }[];
  const names = new Set(rows.map((r) => r.name));
  if (
    !names.has('__agent_sqlite_metadata') ||
    !names.has('__agent_sqlite_migrations')
  ) {
    throw new AgentSqliteRuntimeError({
      kind: 'agent_sqlite_migration_failed',
      retryable: false,
      subsystem: 'agent_sqlite',
      message:
        'migration post-check failed: __agent_sqlite_metadata or __agent_sqlite_migrations missing',
    });
  }
}

function bootstrapMetadata(db: SqliteDatabase, agentName: string): void {
  db.exec(CREATE_METADATA);
  const sel = db.prepare(
    `select value from __agent_sqlite_metadata where key = ?`,
  );
  const ins = db.prepare(
    `insert into __agent_sqlite_metadata (key, value) values (?, ?)`,
  );

  const agentRow = sel.get('agent_name') as { value: string } | undefined;
  if (agentRow === undefined) {
    ins.run('agent_name', agentName);
  } else if (agentRow.value !== agentName) {
    throw new AgentSqliteRuntimeError({
      kind: 'agent_sqlite_agent_mismatch',
      retryable: false,
      subsystem: 'agent_sqlite',
      agentName,
      message: `agent_sqlite_agent_mismatch: file owned by ${agentRow.value}, requested ${agentName}`,
    });
  }

  const verRow = sel.get('store_format_version') as
    | { value: string }
    | undefined;
  if (verRow === undefined) {
    ins.run('store_format_version', '1');
  } else if (verRow.value !== '1') {
    throw new AgentSqliteRuntimeError({
      kind: 'agent_sqlite_open_failed',
      retryable: false,
      subsystem: 'agent_sqlite',
      agentName,
      message: `unsupported store_format_version: ${verRow.value}`,
    });
  }

  db.exec(CREATE_MIGRATIONS);
}

function loadLedger(db: SqliteDatabase): LedgerRow[] {
  return db
    .prepare(
      `select id, position, hash, applied_at from __agent_sqlite_migrations order by position asc`,
    )
    .all() as LedgerRow[];
}

function validateLedgerPrefix(
  bundle: readonly SqliteMigration[],
  rows: LedgerRow[],
  agentName: string,
  reactorName: string,
  bundleHash: string,
): readonly SqliteMigration[] {
  const k = rows.length;
  if (k === 0) {
    return bundle;
  }
  if (k > bundle.length) {
    throw new AgentSqliteRuntimeError(
      driftDetail(
        agentName,
        reactorName,
        bundleHash,
        `ledger has ${k} rows but bundle has ${bundle.length}`,
      ),
    );
  }
  for (let i = 0; i < k; i += 1) {
    const row = rows[i]!;
    if (row.position !== i + 1) {
      throw new AgentSqliteRuntimeError(
        driftDetail(
          agentName,
          reactorName,
          bundleHash,
          `non-consecutive position: expected ${i + 1}, got ${row.position}`,
        ),
      );
    }
    const expected = bundle[i]!;
    if (row.id !== expected.id || row.hash !== expected.hash) {
      throw new AgentSqliteRuntimeError(
        driftDetail(
          agentName,
          reactorName,
          bundleHash,
          `ledger row ${i + 1}: expected id=${expected.id} hash=${expected.hash}, got id=${row.id} hash=${row.hash}`,
        ),
      );
    }
  }
  return bundle.slice(k);
}

function assertMigrationSqlAllowed(
  m: SqliteMigration,
  agentName: string,
  reactorName: string,
  bundleHash: string,
): void {
  if (containsReservedAgentSqliteTable(m.sql)) {
    throw new AgentSqliteRuntimeError({
      kind: 'agent_sqlite_migration_failed',
      retryable: false,
      subsystem: 'agent_sqlite',
      agentName,
      reactorName,
      migrationId: m.id,
      bundleHash,
      message: `migration ${m.id}: __agent_sqlite_* is forbidden in agent SQL`,
    });
  }
  if (migrationSqlContainsTransactionControl(m.sql)) {
    throw new AgentSqliteRuntimeError({
      kind: 'agent_sqlite_migration_failed',
      retryable: false,
      subsystem: 'agent_sqlite',
      agentName,
      reactorName,
      migrationId: m.id,
      bundleHash,
      message: `migration ${m.id}: explicit transaction control (begin/commit/savepoint/rollback) is not allowed`,
    });
  }
  const recomputed = computeNormalizedMigrationSqlHash(m.sql);
  if (recomputed !== m.hash) {
    throw new AgentSqliteRuntimeError(
      driftDetail(
        agentName,
        reactorName,
        bundleHash,
        `migration ${m.id}: hash mismatch at open (declared ${m.hash} vs normalized ${recomputed})`,
      ),
    );
  }
}

function applyPendingMigrations(
  db: SqliteDatabase,
  bundle: readonly SqliteMigration[],
  pending: readonly SqliteMigration[],
  agentName: string,
  reactorName: string,
  bundleHash: string,
  migrationMaxMsPerMigration: number,
): void {
  const k = bundle.length - pending.length;
  const ins = db.prepare(
    `insert into __agent_sqlite_migrations (id, position, hash, applied_at) values (?, ?, ?, ?)`,
  );

  for (let i = 0; i < pending.length; i += 1) {
    const m = pending[i]!;
    const position = k + i + 1;
    assertMigrationSqlAllowed(m, agentName, reactorName, bundleHash);

    const started = Date.now();

    try {
      db.transaction(() => {
        db.exec(m.sql);
        ins.run(m.id, position, m.hash, new Date().toISOString());
      })();
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      throw new AgentSqliteRuntimeError(
        {
          kind: 'agent_sqlite_migration_failed',
          retryable: false,
          subsystem: 'agent_sqlite',
          agentName,
          reactorName,
          migrationId: m.id,
          bundleHash,
          message: `migration ${m.id} failed: ${msg}`,
        },
        { cause },
      );
    }

    const after = Date.now();
    if (after - started > migrationMaxMsPerMigration) {
      throw new AgentSqliteRuntimeError({
        kind: 'agent_sqlite_migration_failed',
        retryable: false,
        subsystem: 'agent_sqlite',
        agentName,
        reactorName,
        migrationId: m.id,
        bundleHash,
        message: `migration ${m.id}: exceeded wall-clock ceiling after completion`,
      });
    }

    assertCoreTables(db);
  }
}

function applyPragmas(db: SqliteDatabase): void {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
}

async function openMigrateAndCache(options: {
  pool: Pool;
  agentName: string;
  reactorName: string;
  migrations: readonly SqliteMigration[];
  baseDir: string;
  lockTimeoutMs: number;
  migrationMaxMsPerMigration: number;
}): Promise<SqliteDatabase> {
  const bundleHash = computeMigrationBundleHash(options.migrations);
  const [lock1, lock2] = computeAgentSqliteAdvisoryLockInts(options.agentName);
  const path = resolveAgentSqliteFilePath(options.baseDir, options.agentName);

  let client: PoolClient | undefined;
  let advisoryLockHeld = false;
  let nativeDb: SqliteDatabase | undefined;
  let phase: SqlitePhase = 'open';

  try {
    mkdirSync(dirname(path), { recursive: true });
    client = await options.pool.connect();

    advisoryLockHeld = await tryAcquireAgentSqliteAdvisoryLockWithTimeout(
      client,
      lock1,
      lock2,
      options.lockTimeoutMs,
    );
    if (!advisoryLockHeld) {
      throw new AgentSqliteRuntimeError({
        kind: 'agent_sqlite_open_failed',
        retryable: true,
        subsystem: 'agent_sqlite',
        agentName: options.agentName,
        reactorName: options.reactorName,
        bundleHash,
        message: 'advisory lock timeout (pg_try_advisory_lock)',
      });
    }

    const afterLock = getValidCachedHandle(options.agentName);
    if (afterLock !== undefined) {
      return afterLock;
    }

    phase = 'open';
    nativeDb = new Database(path);
    applyPragmas(nativeDb);

    phase = 'metadata';
    bootstrapMetadata(nativeDb, options.agentName);

    phase = 'migrate';
    const rows = loadLedger(nativeDb);
    const pending = validateLedgerPrefix(
      options.migrations,
      rows,
      options.agentName,
      options.reactorName,
      bundleHash,
    );
    applyPendingMigrations(
      nativeDb,
      options.migrations,
      pending,
      options.agentName,
      options.reactorName,
      bundleHash,
      options.migrationMaxMsPerMigration,
    );

    setCachedHandle(options.agentName, nativeDb);
    return nativeDb;
  } catch (error) {
    try {
      nativeDb?.close();
    } catch {
      /* ignore */
    }
    const code = readSqliteErrorCode(error);
    if (code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB') {
      evictAgentSqliteHandle(options.agentName);
    }
    return rethrowAsClassifiedAgentSqliteError(error, phase, {
      agentName: options.agentName,
      reactorName: options.reactorName,
      bundleHash,
    });
  } finally {
    if (client !== undefined) {
      if (advisoryLockHeld) {
        await releaseAgentSqliteAdvisoryLock(client, lock1, lock2);
      }
      client.release();
    }
  }
}

export type GetAgentSqliteDbOptions = {
  pool: Pool;
  agentName: string;
  reactorName: string;
  migrations: readonly SqliteMigration[];
  baseDir: string;
  lockTimeoutMs: number;
  migrationMaxMsPerMigration: number;
  tracer?: Tracer;
};

/**
 * Returns a process-local `AgentSqliteDb` facade for the agent’s SQLite file,
 * using the cache fast path or Postgres advisory lock + open + migrate.
 */
export async function getAgentSqliteDb(
  options: GetAgentSqliteDbOptions,
): Promise<AgentSqliteDb> {
  const meta = {
    agentName: options.agentName,
    reactorName: options.reactorName,
  };

  const cached = getValidCachedHandle(options.agentName);
  if (cached !== undefined) {
    return createAgentSqliteDb(cached, meta);
  }

  const db = await takeOrCreateOpeningPromise(options.agentName, () =>
    options.tracer === undefined
      ? openMigrateAndCache(options)
      : runWithRuntimeSpan({
          hop: 'agent_sqlite.open',
          tracer: options.tracer,
          queue: 'reactor-runs',
          agent: options.agentName,
          reactor: options.reactorName,
          operation: 'migrate',
          run: () => openMigrateAndCache(options),
        }),
  );

  return createAgentSqliteDb(db, meta);
}
