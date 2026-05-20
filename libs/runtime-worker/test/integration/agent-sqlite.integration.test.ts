import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineReactor, defineRegistryAgent } from 'runtime-agent';
import {
  closeAllAgentSqliteHandles,
  computeNormalizedMigrationSqlHash,
} from 'runtime-agent-sqlite';
import { agentRunId, ensureAgentRun, markRunQueued } from 'runtime-store';
import { describe, expect, it } from 'vitest';
import { executeRun } from '../../src/execute-run';
import { createRuntimeRegistry } from '../../src/registry';
import {
  bootstrapTestWorker,
  emitFixtureEvent,
  probeIntegrationInfra,
  waitForEventType,
  waitForRunStatus,
  withIsolatedStreamsStore,
} from './harness';

const integrationAvailable = await probeIntegrationInfra();

describe.skipIf(!integrationAvailable)(
  'agent SQLite (worker integration)',
  () => {
    it('migrates then runs handler with ctx.requireDb()', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const baseDir = mkdtempSync(join(tmpdir(), 'syn-agent-sqlite-'));
        try {
          const sql = 'create table t(x integer not null);\n';
          const hash = computeNormalizedMigrationSqlHash(sql);
          const sqliteAgent = defineRegistryAgent({
            name: 'sqlite-agent',
            sqlite: {
              migrations: [{ id: '001-init', hash, sql }],
            },
            reactors: [
              defineReactor({
                name: 'use-db',
                subscribesTo: ['example.ping.v1'],
                handler: async (_e, c) => {
                  await c.requireDb().exec('insert into t(x) values (1)');
                },
              }),
            ],
          });
          const registry = createRuntimeRegistry([sqliteAgent]);
          const event = await emitFixtureEvent(ctx.pool, {
            type: 'example.ping.v1',
            data: { message: 'sqlite' },
            source: 'synapse://test',
            externalId: `sql:${randomUUID()}`,
          });
          const runId = agentRunId({
            inputEventId: event.id,
            agentName: 'sqlite-agent',
            reactorName: 'use-db',
          });
          await ensureAgentRun(ctx.pool, {
            inputEventId: event.id,
            agentName: 'sqlite-agent',
            reactorName: 'use-db',
          });
          await markRunQueued(ctx.pool, runId);
          await executeRun(runId, {
            store: ctx.store,
            registry,
            pool: ctx.pool,
            agentSqlite: {
              baseDir,
              lockTimeoutMs: 30_000,
              migrationMaxMsPerMigration: 300_000,
            },
          });
          await waitForRunStatus(ctx.pool, {
            agentName: 'sqlite-agent',
            reactorName: 'use-db',
            inputEventId: event.id,
            status: 'succeeded',
          });
        } finally {
          closeAllAgentSqliteHandles();
          rmSync(baseDir, { recursive: true, force: true });
        }
      });
    });

    it('retains sqlite rows across worker shutdown and a new worker process', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const baseDir = mkdtempSync(
          join(tmpdir(), 'syn-agent-sqlite-restart-'),
        );
        const visitsSql =
          'create table visits(ping text primary key, n integer not null);\n';
        const visitsHash = computeNormalizedMigrationSqlHash(visitsSql);
        const sqliteRestartAgent = defineRegistryAgent({
          name: 'sqlite-restart-agent',
          sqlite: {
            migrations: [
              { id: '001-visits', hash: visitsHash, sql: visitsSql },
            ],
          },
          reactors: [
            defineReactor({
              name: 'bump',
              subscribesTo: ['example.ping.v1'],
              handler: async (event, c) => {
                const token =
                  typeof (event.data as { token?: unknown }).token === 'string'
                    ? (event.data as { token: string }).token
                    : 'default';
                await c
                  .requireDb()
                  .exec(
                    'insert into visits(ping, n) values (?, 1) on conflict(ping) do update set n = n + 1',
                    [token],
                  );
                const row = await c
                  .requireDb()
                  .one<{ n: number }>('select n from visits where ping = ?', [
                    token,
                  ]);
                const n = row?.n ?? 0;
                await c.emit(
                  'example.pong.v1',
                  { echo: String(n), ping_event_id: event.id },
                  { externalId: `sqlite-restart-pong:${event.id}` },
                );
              },
            }),
          ],
        });

        const agentSqlite = {
          baseDir,
          lockTimeoutMs: 30_000,
          migrationMaxMsPerMigration: 300_000,
        } as const;

        const token = `restart-${randomUUID()}`;

        try {
          const firstPing = await emitFixtureEvent(ctx.pool, {
            type: 'example.ping.v1',
            data: { message: 'first', token },
            source: 'synapse://test',
            externalId: `sqlite-restart-p1:${randomUUID()}`,
          });

          const worker1 = await bootstrapTestWorker({
            ...ctx,
            agents: [sqliteRestartAgent],
            agentSqlite,
          });
          try {
            await waitForRunStatus(ctx.pool, {
              agentName: 'sqlite-restart-agent',
              reactorName: 'bump',
              inputEventId: firstPing.id,
              status: 'succeeded',
            });
            const pong1 = await waitForEventType(ctx.pool, 'example.pong.v1', {
              rootId: firstPing.rootId,
            });
            expect((pong1.data as { echo?: string }).echo).toBe('1');
          } finally {
            await worker1.shutdown();
          }
          closeAllAgentSqliteHandles();

          const secondPing = await emitFixtureEvent(ctx.pool, {
            type: 'example.ping.v1',
            data: { message: 'second', token },
            source: 'synapse://test',
            externalId: `sqlite-restart-p2:${randomUUID()}`,
          });

          const worker2 = await bootstrapTestWorker({
            ...ctx,
            agents: [sqliteRestartAgent],
            agentSqlite,
          });
          try {
            await waitForRunStatus(ctx.pool, {
              agentName: 'sqlite-restart-agent',
              reactorName: 'bump',
              inputEventId: secondPing.id,
              status: 'succeeded',
            });
            const pong2 = await waitForEventType(ctx.pool, 'example.pong.v1', {
              rootId: secondPing.rootId,
            });
            expect((pong2.data as { echo?: string }).echo).toBe('2');
          } finally {
            await worker2.shutdown();
          }
          closeAllAgentSqliteHandles();
        } finally {
          closeAllAgentSqliteHandles();
          rmSync(baseDir, { recursive: true, force: true });
        }
      });
    });

    it('records failure_detail when migration SQL is invalid', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const baseDir = mkdtempSync(join(tmpdir(), 'syn-agent-sqlite-fail-'));
        try {
          const sql = 'create table broken(;\n';
          const hash = computeNormalizedMigrationSqlHash(sql);
          const badAgent = defineRegistryAgent({
            name: 'sqlite-bad',
            sqlite: {
              migrations: [{ id: '001-bad', hash, sql }],
            },
            reactors: [
              defineReactor({
                name: 'noop',
                subscribesTo: ['example.ping.v1'],
                handler: async () => {},
              }),
            ],
          });
          const registry = createRuntimeRegistry([badAgent]);
          const event = await emitFixtureEvent(ctx.pool, {
            type: 'example.ping.v1',
            data: {},
            source: 'synapse://test',
            externalId: `bad:${randomUUID()}`,
          });
          const runId = agentRunId({
            inputEventId: event.id,
            agentName: 'sqlite-bad',
            reactorName: 'noop',
          });
          await ensureAgentRun(ctx.pool, {
            inputEventId: event.id,
            agentName: 'sqlite-bad',
            reactorName: 'noop',
          });
          await markRunQueued(ctx.pool, runId);
          await expect(
            executeRun(runId, {
              store: ctx.store,
              registry,
              pool: ctx.pool,
              agentSqlite: {
                baseDir,
                lockTimeoutMs: 30_000,
                migrationMaxMsPerMigration: 300_000,
              },
            }),
          ).rejects.toThrow();
          const row = await ctx.pool.query(
            `select failure_detail, last_error from agent_runs where id = $1`,
            [runId],
          );
          expect(row.rows[0]?.failure_detail).toMatchObject({
            kind: 'agent_sqlite_migration_failed',
            subsystem: 'agent_sqlite',
          });
          expect(String(row.rows[0]?.last_error)).toMatch(
            /migration|SQLite|SQLITE/i,
          );
        } finally {
          closeAllAgentSqliteHandles();
          rmSync(baseDir, { recursive: true, force: true });
        }
      });
    });
  },
);
