import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { defineReactor, defineRegistryAgent } from 'runtime-agent';
import {
  agentRunId,
  appendEvent,
  ensureAgentRun,
  loadEventsForPlanning,
  markRunQueued,
} from 'runtime-store';
import { describe, expect, it } from 'vitest';
import { executeRun, executeRunFromJobData } from '../../src/execute-run';
import { createRuntimeRegistry } from '../../src/registry';
import { REACTOR_JOB_NAME, REACTOR_QUEUE_NAME } from '../../src/streams';
import {
  assertNoDuplicateEvents,
  assertNoDuplicateRuns,
  bootstrapTestWorker,
  closeRedisClient,
  countRows,
  createFaultInjectingPool,
  delay,
  emitFixtureEvent,
  exampleEchoPingAgent,
  probeIntegrationInfra,
  resetRedis,
  waitForEventType,
  waitForRunStatus,
  withIsolatedStreamsStore,
} from './harness';

const integrationAvailable = await probeIntegrationInfra();

describe.skipIf(!integrationAvailable)('streams minimum failure suite', () => {
  it('ingress_duplicate_concurrent_dedupes', async () => {
    await withIsolatedStreamsStore(async ({ pool }) => {
      const externalId = `dup:${randomUUID()}`;
      const input = {
        type: 'example.ping.v1',
        data: { message: 'x' },
        source: 'synapse://test',
        externalId,
      };
      const results = await Promise.all(
        Array.from({ length: 20 }, () => emitFixtureEvent(pool, input)),
      );
      expect(new Set(results.map((row) => row.id)).size).toBe(1);
      expect(await countRows(pool, 'events')).toBe(1);
      await assertNoDuplicateEvents(pool);
    });
  });

  it('ingress_connection_drop_during_transaction_is_atomic', async () => {
    await withIsolatedStreamsStore(async ({ pool }) => {
      const faultyPool = createFaultInjectingPool(pool, {
        failSqlMatching: /insert into events/i,
      });
      await expect(
        appendEvent(faultyPool, {
          type: 'example.ping.v1',
          data: { message: 'x' },
          source: 'synapse://test',
          externalId: `fault:${randomUUID()}`,
        }),
      ).rejects.toThrow(/Injected fault/);
      expect(await countRows(pool, 'events')).toBe(0);
    });
  });

  it('runtime_executes_reactors_without_relay', async () => {
    await withIsolatedStreamsStore(async (ctx) => {
      const worker = await bootstrapTestWorker(ctx);
      try {
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.ping.v1',
          data: { message: 'no-relay' },
          source: 'synapse://test',
          externalId: `ping:${randomUUID()}`,
        });
        await waitForRunStatus(ctx.pool, {
          agentName: 'example-echo',
          reactorName: 'example-ping',
          inputEventId: event.id,
          status: 'succeeded',
        });
        await waitForEventType(ctx.pool, 'example.pong.v1', {
          rootId: event.rootId,
        });
      } finally {
        await worker.shutdown();
      }
    });
  });

  it('worker_startup_plans_existing_events', async () => {
    await withIsolatedStreamsStore(async (ctx) => {
      const event = await emitFixtureEvent(ctx.pool, {
        type: 'example.ping.v1',
        data: { message: 'pre-start' },
        source: 'synapse://test',
        externalId: `pre:${randomUUID()}`,
      });
      const worker = await bootstrapTestWorker(ctx);
      try {
        await waitForRunStatus(ctx.pool, {
          agentName: 'example-echo',
          reactorName: 'example-ping',
          inputEventId: event.id,
          status: 'succeeded',
        });
      } finally {
        await worker.shutdown();
      }
    });
  });

  it('repeated_planning_is_idempotent', async () => {
    await withIsolatedStreamsStore(async (ctx) => {
      const event = await emitFixtureEvent(ctx.pool, {
        type: 'example.ping.v1',
        data: { message: 'plan' },
        source: 'synapse://test',
        externalId: `plan:${randomUUID()}`,
      });
      const registry = createRuntimeRegistry([exampleEchoPingAgent]);
      for (let i = 0; i < 5; i += 1) {
        const events = await loadEventsForPlanning(ctx.pool, 100);
        for (const loaded of events) {
          const reactors = registry.matchReactors(loaded.type);
          for (const reactor of reactors) {
            await ensureAgentRun(ctx.pool, {
              inputEventId: loaded.id,
              agentName: reactor.agentName,
              reactorName: reactor.reactorName,
            });
          }
        }
      }
      const runs = await ctx.pool.query(
        `select count(*)::int as c from agent_runs where input_event_id = $1`,
        [event.id],
      );
      expect(Number(runs.rows[0].c)).toBe(1);
    });
  });

  it('planner_does_not_starve_new_events_when_many_old_events_exist', async () => {
    await withIsolatedStreamsStore(async (ctx) => {
      for (let i = 0; i < 30; i += 1) {
        await emitFixtureEvent(ctx.pool, {
          type: 'example.unsubscribed.v1',
          data: { i },
          source: 'synapse://test',
          externalId: `old:${randomUUID()}`,
        });
      }
      const newest = await emitFixtureEvent(ctx.pool, {
        type: 'example.ping.v1',
        data: { message: 'newest' },
        source: 'synapse://test',
        externalId: `new:${randomUUID()}`,
      });
      const worker = await bootstrapTestWorker(ctx);
      try {
        await waitForRunStatus(ctx.pool, {
          agentName: 'example-echo',
          reactorName: 'example-ping',
          inputEventId: newest.id,
          status: 'succeeded',
        });
      } finally {
        await worker.shutdown();
      }
    });
  });

  it('redis_down_before_queueing_keeps_runs_pending_then_recovers', async () => {
    await withIsolatedStreamsStore(async (ctx) => {
      const event = await emitFixtureEvent(ctx.pool, {
        type: 'example.ping.v1',
        data: { message: 'redis-down' },
        source: 'synapse://test',
        externalId: `redis:${randomUUID()}`,
      });
      await ensureAgentRun(ctx.pool, {
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      const badRedis = 'redis://127.0.0.1:59999';
      const connection = new IORedis(badRedis, {
        maxRetriesPerRequest: null,
        connectTimeout: 500,
        retryStrategy: () => null,
      });
      const queue = new Queue(REACTOR_QUEUE_NAME, { connection });
      try {
        await expect(
          queue.add(
            'reactor.run',
            {
              runId: agentRunId({
                inputEventId: event.id,
                agentName: 'example-echo',
                reactorName: 'example-ping',
              }),
            },
            {
              jobId: agentRunId({
                inputEventId: event.id,
                agentName: 'example-echo',
                reactorName: 'example-ping',
              }),
            },
          ),
        ).rejects.toThrow();
      } finally {
        await queue.close().catch(() => {});
        await closeRedisClient(connection);
      }
      const pending = await ctx.pool.query(
        `select status from agent_runs where input_event_id = $1`,
        [event.id],
      );
      expect(pending.rows[0].status).toBe('pending');
      const worker = await bootstrapTestWorker(ctx);
      try {
        await waitForRunStatus(ctx.pool, {
          agentName: 'example-echo',
          reactorName: 'example-ping',
          inputEventId: event.id,
          status: 'succeeded',
        });
      } finally {
        await worker.shutdown();
      }
    });
  });

  it('redis_flush_after_mark_queued_recovers_via_repair', async () => {
    await withIsolatedStreamsStore(async (ctx) => {
      const event = await emitFixtureEvent(ctx.pool, {
        type: 'example.ping.v1',
        data: { message: 'flush' },
        source: 'synapse://test',
        externalId: `flush:${randomUUID()}`,
      });
      const runId = agentRunId({
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      await ensureAgentRun(ctx.pool, {
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      const connection = new IORedis(ctx.redisUrl, {
        maxRetriesPerRequest: null,
      });
      const queue = new Queue(REACTOR_QUEUE_NAME, { connection });
      await queue.add('reactor.run', { runId }, { jobId: runId });
      await markRunQueued(ctx.pool, runId);
      await resetRedis(ctx.redisUrl);
      await ctx.pool.query(
        `
          update agent_runs
          set status = 'queued',
              updated_at = now() - interval '6 minutes'
          where id = $1
        `,
        [runId],
      );
      const worker = await bootstrapTestWorker(ctx);
      try {
        await waitForRunStatus(ctx.pool, {
          agentName: 'example-echo',
          reactorName: 'example-ping',
          inputEventId: event.id,
          status: 'succeeded',
        });
      } finally {
        await worker.shutdown();
      }
    });
  });

  it('duplicate_bullmq_jobs_for_same_run_are_harmless', async () => {
    await withIsolatedStreamsStore(async (ctx) => {
      const event = await emitFixtureEvent(ctx.pool, {
        type: 'example.ping.v1',
        data: { message: 'dup-job' },
        source: 'synapse://test',
        externalId: `dupjob:${randomUUID()}`,
      });
      const runId = agentRunId({
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      await ensureAgentRun(ctx.pool, {
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      const queueConnection = new IORedis(ctx.redisUrl, {
        maxRetriesPerRequest: null,
      });
      const workerConnection = new IORedis(ctx.redisUrl, {
        maxRetriesPerRequest: null,
      });
      const queue = new Queue(REACTOR_QUEUE_NAME, {
        connection: queueConnection,
      });
      const registry = createRuntimeRegistry([exampleEchoPingAgent]);
      await queue.add('reactor.run', { runId }, { jobId: runId });
      await queue.add('reactor.run', { runId }, { jobId: runId });
      await markRunQueued(ctx.pool, runId);
      const worker = new Worker(
        REACTOR_QUEUE_NAME,
        async (job) => {
          await executeRunFromJobData(job.data, {
            store: ctx.store,
            registry,
          });
        },
        { connection: workerConnection, concurrency: 1 },
      );
      try {
        await waitForRunStatus(ctx.pool, {
          agentName: 'example-echo',
          reactorName: 'example-ping',
          inputEventId: event.id,
          status: 'succeeded',
        });
        await assertNoDuplicateEvents(ctx.pool);
        await assertNoDuplicateRuns(ctx.pool);
      } finally {
        await worker.close();
        await queue.close();
        await closeRedisClient(workerConnection);
        await closeRedisClient(queueConnection);
      }
    });
  });

  it('ctx_emit_sets_root_and_parent_ids', async () => {
    await withIsolatedStreamsStore(async (ctx) => {
      const event = await emitFixtureEvent(ctx.pool, {
        type: 'example.ping.v1',
        data: { message: 'root' },
        source: 'synapse://test',
        externalId: `root:${randomUUID()}`,
      });
      const runId = agentRunId({
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      await ensureAgentRun(ctx.pool, {
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      const registry = createRuntimeRegistry([exampleEchoPingAgent]);
      await markRunQueued(ctx.pool, runId);
      await executeRun(runId, { store: ctx.store, registry });
      const pong = await waitForEventType(ctx.pool, 'example.pong.v1', {
        rootId: event.rootId,
      });
      expect(pong.rootId).toBe(event.rootId);
      expect(pong.parentId).toBe(event.id);
    });
  });

  it('queueing_one_item_failure_does_not_block_other_runs', async () => {
    await withIsolatedStreamsStore(async (ctx) => {
      const failingAgent = defineRegistryAgent({
        name: 'fail-agent',
        reactors: [
          defineReactor({
            name: 'always-fail',
            subscribesTo: ['example.fail.v1'],
            handler: async () => {
              throw new Error('boom');
            },
          }),
        ],
      });
      const worker = await bootstrapTestWorker({
        ...ctx,
        agents: [exampleEchoPingAgent, failingAgent],
      });
      const failEvent = await emitFixtureEvent(ctx.pool, {
        type: 'example.fail.v1',
        data: {},
        source: 'synapse://test',
        externalId: `fail:${randomUUID()}`,
      });
      const okEvent = await emitFixtureEvent(ctx.pool, {
        type: 'example.ping.v1',
        data: { message: 'ok' },
        source: 'synapse://test',
        externalId: `ok:${randomUUID()}`,
      });
      try {
        await waitForRunStatus(ctx.pool, {
          agentName: 'example-echo',
          reactorName: 'example-ping',
          inputEventId: okEvent.id,
          status: 'succeeded',
        });
        const failed = await ctx.pool.query(
          `select status from agent_runs where input_event_id = $1`,
          [failEvent.id],
        );
        expect(failed.rows[0].status).toBe('failed');
      } finally {
        await worker.shutdown();
      }
    });
  });
});

describe('streams minimum failure suite (unit-backed)', () => {
  it('repair_handles_overdue_running_after_worker_downtime', async () => {
    if (!integrationAvailable) {
      return;
    }
    await withIsolatedStreamsStore(async (ctx) => {
      const event = await emitFixtureEvent(ctx.pool, {
        type: 'example.ping.v1',
        data: { message: 'stale-running' },
        source: 'synapse://test',
        externalId: `stale-run:${randomUUID()}`,
      });
      const runId = agentRunId({
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      await ensureAgentRun(ctx.pool, {
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      await ctx.pool.query(
        `
          update agent_runs
          set status = 'running',
              locked_until = now() - interval '1 second'
          where id = $1
        `,
        [runId],
      );
      await ctx.store.repairStaleRuns();
      const row = await ctx.pool.query(
        `select status from agent_runs where id = $1`,
        [runId],
      );
      expect(row.rows[0].status).toBe('pending');
      const worker = await bootstrapTestWorker(ctx);
      try {
        await waitForRunStatus(ctx.pool, {
          agentName: 'example-echo',
          reactorName: 'example-ping',
          inputEventId: event.id,
          status: 'succeeded',
        });
      } finally {
        await worker.shutdown();
      }
    });
  });

  it('repair_handles_overdue_queued_after_redis_downtime', async () => {
    if (!integrationAvailable) {
      return;
    }
    await withIsolatedStreamsStore(async (ctx) => {
      const event = await emitFixtureEvent(ctx.pool, {
        type: 'example.ping.v1',
        data: { message: 'stale-queued' },
        source: 'synapse://test',
        externalId: `stale-q:${randomUUID()}`,
      });
      const runId = agentRunId({
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      await ensureAgentRun(ctx.pool, {
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'example-ping',
      });
      await ctx.pool.query(
        `
          update agent_runs
          set status = 'queued',
              updated_at = now() - interval '6 minutes'
          where id = $1
        `,
        [runId],
      );
      await ctx.store.repairStaleRuns();
      const row = await ctx.pool.query(
        `select status from agent_runs where id = $1`,
        [runId],
      );
      expect(row.rows[0].status).toBe('pending');
    });
  });
});
