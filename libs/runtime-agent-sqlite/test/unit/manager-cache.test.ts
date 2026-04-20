import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentSqliteRuntimeError } from '../../src/errors';
import {
  __testingResetAgentSqliteHandleCaches,
  closeAllAgentSqliteHandles,
  computeNormalizedMigrationSqlHash,
  getAgentSqliteDb,
} from '../../src/index';

describe('getAgentSqliteDb (cache + advisory)', () => {
  afterEach(() => {
    closeAllAgentSqliteHandles();
    __testingResetAgentSqliteHandleCaches();
  });

  function createMockPool(): {
    pool: Pool;
    counts: { tryLock: number; connect: number };
  } {
    const counts = { tryLock: 0, connect: 0 };
    const pool = {
      connect: vi.fn(async () => {
        counts.connect += 1;
        return {
          query: vi.fn(async (sql: string) => {
            if (sql.includes('pg_try_advisory_lock')) {
              counts.tryLock += 1;
              return { rows: [{ ok: true }] };
            }
            if (sql.includes('pg_advisory_unlock')) {
              return { rows: [{ ok: true }] };
            }
            return { rows: [] };
          }),
          release: vi.fn(),
        };
      }),
    } as unknown as Pool;
    return { pool, counts };
  }

  it('classifies pool.connect failure as agent_sqlite_open_failed', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'syn-sqlite-pg-'));
    const pool = {
      connect: vi
        .fn()
        .mockRejectedValue(new Error('timeout waiting for client from pool')),
    } as unknown as Pool;
    const sql = 'create table t(x int);\n';
    const hash = computeNormalizedMigrationSqlHash(sql);
    try {
      await expect(
        getAgentSqliteDb({
          pool,
          agentName: 'pg-fail-agent',
          reactorName: 'r',
          migrations: [{ id: '001', hash, sql }],
          baseDir,
          lockTimeoutMs: 5000,
          migrationMaxMsPerMigration: 60_000,
        }),
      ).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof AgentSqliteRuntimeError &&
          e.detail.kind === 'agent_sqlite_open_failed' &&
          e.detail.retryable === true,
      );
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it('second cached open does not connect to Postgres', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'syn-sqlite-cache-'));
    const { pool, counts } = createMockPool();
    const sql = 'create table t(x int);\n';
    const hash = computeNormalizedMigrationSqlHash(sql);
    const opts = {
      pool,
      agentName: 'cache-agent',
      reactorName: 'r',
      migrations: [{ id: '001', hash, sql }],
      baseDir,
      lockTimeoutMs: 5000,
      migrationMaxMsPerMigration: 60_000,
    };
    try {
      await getAgentSqliteDb(opts);
      expect(counts.connect).toBe(1);
      await getAgentSqliteDb(opts);
      expect(counts.connect).toBe(1);
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it('concurrent cold opens share one advisory try and one pool connect', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'syn-sqlite-conc-'));
    const { pool, counts } = createMockPool();
    const sql = 'create table t(x int);\n';
    const hash = computeNormalizedMigrationSqlHash(sql);
    const opts = {
      pool,
      agentName: 'conc-agent',
      reactorName: 'r',
      migrations: [{ id: '001', hash, sql }],
      baseDir,
      lockTimeoutMs: 5000,
      migrationMaxMsPerMigration: 60_000,
    };
    try {
      await Promise.all([getAgentSqliteDb(opts), getAgentSqliteDb(opts)]);
      expect(counts.connect).toBe(1);
      expect(counts.tryLock).toBe(1);
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it('rejects migration SQL with explicit transaction control', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'syn-sqlite-tx-'));
    const { pool } = createMockPool();
    const sql = 'begin immediate;\nselect 1;\n';
    const hash = computeNormalizedMigrationSqlHash(sql);
    try {
      await expect(
        getAgentSqliteDb({
          pool,
          agentName: 'tx-agent',
          reactorName: 'r',
          migrations: [{ id: '001', hash, sql }],
          baseDir,
          lockTimeoutMs: 5000,
          migrationMaxMsPerMigration: 60_000,
        }),
      ).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof AgentSqliteRuntimeError &&
          e.detail.kind === 'agent_sqlite_migration_failed',
      );
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it('detects migration bundle reorder vs persisted ledger', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'syn-sqlite-reorder-'));
    const { pool } = createMockPool();
    const sq1 = 'create table u(i int);\n';
    const h1 = computeNormalizedMigrationSqlHash(sq1);
    const sq2 = 'insert into u values (1);\n';
    const h2 = computeNormalizedMigrationSqlHash(sq2);
    const agentName = 'reorder-agent';
    try {
      await getAgentSqliteDb({
        pool,
        agentName,
        reactorName: 'r',
        migrations: [
          { id: 'a', hash: h1, sql: sq1 },
          { id: 'b', hash: h2, sql: sq2 },
        ],
        baseDir,
        lockTimeoutMs: 5000,
        migrationMaxMsPerMigration: 60_000,
      });
      closeAllAgentSqliteHandles();
      __testingResetAgentSqliteHandleCaches();
      await expect(
        getAgentSqliteDb({
          pool,
          agentName,
          reactorName: 'r',
          migrations: [
            { id: 'b', hash: h2, sql: sq2 },
            { id: 'a', hash: h1, sql: sq1 },
          ],
          baseDir,
          lockTimeoutMs: 5000,
          migrationMaxMsPerMigration: 60_000,
        }),
      ).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof AgentSqliteRuntimeError &&
          e.detail.kind === 'agent_sqlite_migration_drift',
      );
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it('detects declared hash mismatch vs persisted ledger', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'syn-sqlite-hash-'));
    const { pool } = createMockPool();
    const sql = 'create table v(i int);\n';
    const goodHash = computeNormalizedMigrationSqlHash(sql);
    const agentName = 'hash-agent';
    try {
      await getAgentSqliteDb({
        pool,
        agentName,
        reactorName: 'r',
        migrations: [{ id: '001', hash: goodHash, sql }],
        baseDir,
        lockTimeoutMs: 5000,
        migrationMaxMsPerMigration: 60_000,
      });
      closeAllAgentSqliteHandles();
      __testingResetAgentSqliteHandleCaches();
      const badHash = `sha256:${'f'.repeat(64)}`;
      await expect(
        getAgentSqliteDb({
          pool,
          agentName,
          reactorName: 'r',
          migrations: [{ id: '001', hash: badHash, sql }],
          baseDir,
          lockTimeoutMs: 5000,
          migrationMaxMsPerMigration: 60_000,
        }),
      ).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof AgentSqliteRuntimeError &&
          e.detail.kind === 'agent_sqlite_migration_drift',
      );
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
