import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentSqliteDb } from '../../src/create-db';
import { AgentSqliteRuntimeError } from '../../src/errors';
import * as handleCache from '../../src/handle-cache';

describe('createAgentSqliteDb', () => {
  const meta = { agentName: 'test-agent', reactorName: 'r1' };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects all() maxRows that are not positive integers', async () => {
    const db = new Database(':memory:');
    try {
      const facade = createAgentSqliteDb(db, meta);
      await expect(
        facade.all('select 1', [], { maxRows: 0 }),
      ).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof AgentSqliteRuntimeError &&
          e.detail.kind === 'agent_sqlite_query_failed',
      );
      await expect(
        facade.all('select 1', [], { maxRows: 1.5 }),
      ).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof AgentSqliteRuntimeError &&
          e.detail.kind === 'agent_sqlite_query_failed',
      );
    } finally {
      db.close();
    }
  });

  it('throws agent_sqlite_result_limit_exceeded after maxRows + 1 rows seen', async () => {
    const db = new Database(':memory:');
    try {
      db.exec(
        'create table t(i int); insert into t values (1),(2),(3),(4),(5);',
      );
      const facade = createAgentSqliteDb(db, meta);
      await expect(
        facade.all('select i from t order by i', [], { maxRows: 2 }),
      ).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof AgentSqliteRuntimeError &&
          e.detail.kind === 'agent_sqlite_result_limit_exceeded',
      );
    } finally {
      db.close();
    }
  });

  it('rejects pragma on exec', async () => {
    const db = new Database(':memory:');
    try {
      const facade = createAgentSqliteDb(db, meta);
      await expect(facade.exec('pragma foreign_keys = off')).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof AgentSqliteRuntimeError &&
          e.detail.kind === 'agent_sqlite_query_failed',
      );
    } finally {
      db.close();
    }
  });

  it('rejects attach after leading block comment', async () => {
    const db = new Database(':memory:');
    try {
      const facade = createAgentSqliteDb(db, meta);
      await expect(
        facade.exec('/*c*/ attach database ":memory:" as x'),
      ).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof AgentSqliteRuntimeError &&
          e.detail.kind === 'agent_sqlite_query_failed',
      );
    } finally {
      db.close();
    }
  });

  it('rejects unterminated block comment on read path', async () => {
    const db = new Database(':memory:');
    try {
      const facade = createAgentSqliteDb(db, meta);
      await expect(facade.all('select 1 /*')).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof AgentSqliteRuntimeError &&
          e.detail.kind === 'agent_sqlite_query_failed',
      );
    } finally {
      db.close();
    }
  });

  it('maps multi-statement exec to query_failed', async () => {
    const db = new Database(':memory:');
    try {
      db.exec('create table t(i int);');
      const facade = createAgentSqliteDb(db, meta);
      await expect(
        facade.exec('insert into t values (1); insert into t values (2);'),
      ).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof AgentSqliteRuntimeError &&
          e.detail.kind === 'agent_sqlite_query_failed',
      );
    } finally {
      db.close();
    }
  });

  it('evicts cache and throws open_failed on SQLITE_CORRUPT during one()', async () => {
    const evictSpy = vi.spyOn(handleCache, 'evictAgentSqliteHandle');
    const db = new Database(':memory:');
    const originalPrepare = db.prepare.bind(db);
    try {
      db.prepare = ((sql: string) => {
        void sql;
        const err = new Error('db corrupt');
        Object.assign(err, { code: 'SQLITE_CORRUPT' });
        throw err;
      }) as typeof db.prepare;

      const facade = createAgentSqliteDb(db, meta);
      await expect(facade.one('select 1')).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof AgentSqliteRuntimeError &&
          e.detail.kind === 'agent_sqlite_open_failed',
      );
      expect(evictSpy).toHaveBeenCalledWith('test-agent');
    } finally {
      db.prepare = originalPrepare;
      db.close();
    }
  });

  it('maps SQLITE_BUSY from handler paths to retryable query_failed', async () => {
    const db = new Database(':memory:');
    const originalPrepare = db.prepare.bind(db);
    try {
      db.prepare = ((sql: string) => {
        void sql;
        const err = new Error('database is locked');
        Object.assign(err, { code: 'SQLITE_BUSY' });
        throw err;
      }) as typeof db.prepare;

      const facade = createAgentSqliteDb(db, meta);
      await expect(facade.one('select 1')).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof AgentSqliteRuntimeError &&
          e.detail.kind === 'agent_sqlite_query_failed' &&
          e.detail.retryable === true,
      );
    } finally {
      db.prepare = originalPrepare;
      db.close();
    }
  });
});
