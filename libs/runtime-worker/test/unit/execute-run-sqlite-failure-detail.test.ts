import { defineReactor, defineRegistryAgent } from 'runtime-agent';
import {
  AgentSqliteRuntimeError,
  computeNormalizedMigrationSqlHash,
} from 'runtime-agent-sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAgentSqliteDb = vi.hoisted(() => vi.fn());

vi.mock('runtime-agent-sqlite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('runtime-agent-sqlite')>();
  return {
    ...actual,
    getAgentSqliteDb,
  };
});

import { executeRun } from '../../src/execute-run';
import { createRuntimeRegistry } from '../../src/registry';

const migration001 = (() => {
  const sql = 'create table t(x int);\n';
  return {
    id: '001',
    hash: computeNormalizedMigrationSqlHash(sql),
    sql,
  };
})();

describe('executeRun sqlite failure_detail', () => {
  const storeBase = {
    claimRun: vi.fn().mockResolvedValue({
      id: 'run-1',
      inputEventId: 'evt-1',
      agentName: 'sqlite-agent',
      reactorName: 'r',
      status: 'running',
      attemptCount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
    loadEvent: vi.fn().mockResolvedValue({
      id: 'evt-1',
      type: 'example.ping.v1',
      source: 'test',
      externalId: 'ext',
      data: {},
      rootId: 'evt-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
    markRunFailed: vi.fn(),
    markRunSucceeded: vi.fn(),
  };

  beforeEach(() => {
    getAgentSqliteDb.mockReset();
    getAgentSqliteDb.mockResolvedValue({
      exec: vi.fn(),
      all: vi.fn(),
      one: vi.fn(),
    });
  });

  it('persists failure_detail when requireDb().exec throws AgentSqliteRuntimeError', async () => {
    const sqliteDetail = {
      kind: 'agent_sqlite_query_failed' as const,
      retryable: false,
      subsystem: 'agent_sqlite' as const,
      agentName: 'sqlite-agent',
      reactorName: 'r',
      message: 'syntax error near "nope"',
    };
    getAgentSqliteDb.mockResolvedValue({
      exec: vi
        .fn()
        .mockRejectedValue(new AgentSqliteRuntimeError(sqliteDetail)),
      all: vi.fn(),
      one: vi.fn(),
    });
    const registry = createRuntimeRegistry([
      defineRegistryAgent({
        name: 'sqlite-agent',
        sqlite: { migrations: [migration001] },
        reactors: [
          defineReactor({
            name: 'r',
            subscribesTo: ['example.ping.v1'],
            handler: async (_e, c) => {
              await c.requireDb().exec('nope');
            },
          }),
        ],
      }),
    ]);
    const store = { ...storeBase };
    const pool = {} as never;
    await expect(
      executeRun('run-1', {
        store: store as never,
        registry,
        pool,
        agentSqlite: {
          baseDir: '/tmp',
          lockTimeoutMs: 1000,
          migrationMaxMsPerMigration: 60_000,
        },
      }),
    ).rejects.toThrow(/syntax error near/);
    expect(store.markRunFailed).toHaveBeenCalledWith(
      'run-1',
      expect.any(AgentSqliteRuntimeError),
      sqliteDetail,
    );
  });

  it('does not invent failure_detail for generic handler errors on sqlite agents', async () => {
    const registry = createRuntimeRegistry([
      defineRegistryAgent({
        name: 'sqlite-agent',
        sqlite: { migrations: [migration001] },
        reactors: [
          defineReactor({
            name: 'r',
            subscribesTo: ['example.ping.v1'],
            handler: async () => {
              throw new Error('boom');
            },
          }),
        ],
      }),
    ]);
    const store = { ...storeBase };
    const pool = {} as never;
    await expect(
      executeRun('run-1', {
        store: store as never,
        registry,
        pool,
        agentSqlite: {
          baseDir: '/tmp',
          lockTimeoutMs: 1000,
          migrationMaxMsPerMigration: 60_000,
        },
      }),
    ).rejects.toThrow(/boom/);
    expect(store.markRunFailed).toHaveBeenCalledWith(
      'run-1',
      expect.any(Error),
      undefined,
    );
  });
});
