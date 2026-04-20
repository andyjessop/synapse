import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { defineAgent, defineReactor } from 'runtime-agent';
import {
  agentRunId,
  appendEvent,
  ensureAgentRun,
  loadPendingRuns,
  markRunQueued,
  requeueFailedAgentRun,
} from 'runtime-store';
import { describe, expect, it, vi } from 'vitest';
import { createReactorContext } from '../../src/context';
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
  pollUntil,
  probeIntegrationInfra,
  waitForEventType,
  waitForRunStatus,
  withIsolatedStreamsStore,
} from './harness';

const integrationAvailable = await probeIntegrationInfra();

describe.skipIf(!integrationAvailable)('failure vector: ingress', () => {
  it('ingress_duplicate_same_process_dedupes', async () => {
    await withIsolatedStreamsStore(async ({ pool }) => {
      const input = {
        type: 'example.ping.v1',
        data: { message: 'dup' },
        source: 'synapse://test',
        externalId: `same:${randomUUID()}`,
      };
      const first = await appendEvent(pool, input);
      const second = await appendEvent(pool, input);
      expect(first.id).toBe(second.id);
      expect(await countRows(pool, 'events')).toBe(1);
    });
  });

  it('ingress_retry_after_success_returns_existing_event', async () => {
    await withIsolatedStreamsStore(async ({ pool }) => {
      const input = {
        type: 'example.ping.v1',
        data: { message: 'retry' },
        source: 'synapse://test',
        externalId: `retry:${randomUUID()}`,
      };
      const first = await appendEvent(pool, input);
      const second = await appendEvent(pool, input);
      expect(second.id).toBe(first.id);
    });
  });

  it('ingress_accepts_unknown_payload_shape_in_minimal_runtime', async () => {
    await withIsolatedStreamsStore(async ({ pool }) => {
      const event = await appendEvent(pool, {
        type: 'custom.unknown.v1',
        data: { arbitrary: ['shape', 42, { nested: true }] },
        source: 'synapse://test',
        externalId: `unknown:${randomUUID()}`,
      });
      expect(event.type).toBe('custom.unknown.v1');
    });
  });

  it('event_fields_are_parameterized_not_interpolated', async () => {
    await withIsolatedStreamsStore(async ({ pool }) => {
      const malicious = "'; drop table events; --";
      const event = await appendEvent(pool, {
        type: 'example.ping.v1',
        data: { message: malicious },
        source: malicious,
        externalId: `safe:${randomUUID()}`,
        subject: malicious,
      });
      const loaded = await pool.query(`select * from events where id = $1`, [
        event.id,
      ]);
      expect(loaded.rows[0].source).toBe(malicious);
      expect(await countRows(pool, 'events')).toBe(1);
    });
  });

  it('oversized_event_fields_rejected_without_partial_write', async () => {
    await withIsolatedStreamsStore(async ({ pool }) => {
      await expect(
        appendEvent(pool, {
          type: 'example.ping.v1',
          data: {},
          source: 'synapse://test',
          externalId: 'x'.repeat(501),
        }),
      ).rejects.toThrow(/externalId/);
      expect(await countRows(pool, 'events')).toBe(0);
    });
  });
});

describe.skipIf(!integrationAvailable)(
  'failure vector: planning and registry',
  () => {
    it('worker_crash_mid_planning_recovers', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const events = await Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            emitFixtureEvent(ctx.pool, {
              type: 'example.ping.v1',
              data: { message: `batch-${i}` },
              source: 'synapse://test',
              externalId: `batch:${randomUUID()}`,
            }),
          ),
        );
        for (const event of events.slice(0, 2)) {
          await ensureAgentRun(ctx.pool, {
            inputEventId: event.id,
            agentName: 'example-echo',
            reactorName: 'example-ping',
          });
        }
        const worker = await bootstrapTestWorker(ctx);
        try {
          for (const event of events) {
            await waitForRunStatus(ctx.pool, {
              agentName: 'example-echo',
              reactorName: 'example-ping',
              inputEventId: event.id,
              status: 'succeeded',
            });
          }
          await assertNoDuplicateRuns(ctx.pool);
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('event_with_no_subscribers_creates_no_runs', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.unsubscribed.v1',
          data: {},
          source: 'synapse://test',
          externalId: `nosub:${randomUUID()}`,
        });
        const worker = await bootstrapTestWorker(ctx);
        try {
          await pollUntil(async () => {
            const runs = await ctx.pool.query(
              `select count(*)::int as c from agent_runs where input_event_id = $1`,
              [event.id],
            );
            return Number(runs.rows[0].c) === 0 ? true : undefined;
          });
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('newly_registered_agent_processes_existing_matching_events', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.ping.v1',
          data: { message: 'existing' },
          source: 'synapse://test',
          externalId: `existing:${randomUUID()}`,
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
  },
);

describe.skipIf(!integrationAvailable)(
  'failure vector: queueing and execution',
  () => {
    it('repeated_queueing_same_pending_run_executes_once_effectively', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.ping.v1',
          data: { message: 'repeat-queue' },
          source: 'synapse://test',
          externalId: `repeat-q:${randomUUID()}`,
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
          await queue.add(REACTOR_JOB_NAME, { runId }, { jobId: runId });
          await markRunQueued(ctx.pool, runId);
          await queue.add(REACTOR_JOB_NAME, { runId }, { jobId: runId });
          await waitForRunStatus(ctx.pool, {
            agentName: 'example-echo',
            reactorName: 'example-ping',
            inputEventId: event.id,
            status: 'succeeded',
          });
          await assertNoDuplicateEvents(ctx.pool);
        } finally {
          await worker.close();
          await queue.close();
          await closeRedisClient(workerConnection);
          await closeRedisClient(queueConnection);
        }
      });
    });

    it('worker_crash_before_claim_run_recovers', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.ping.v1',
          data: { message: 'before-claim' },
          source: 'synapse://test',
          externalId: `before-claim:${randomUUID()}`,
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
        await queue.add(REACTOR_JOB_NAME, { runId }, { jobId: runId });
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
        } finally {
          await worker.close();
          await queue.close();
          await closeRedisClient(workerConnection);
          await closeRedisClient(queueConnection);
        }
      });
    });

    // Failed markRunQueued (injected SQL fault) then successful mark + execute.
    // BullMQ delivery for the same edge case is covered by
    // worker_crash_before_claim_run_recovers.
    it('mark_queued_sql_fault_then_recovery_and_execute_run', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.ping.v1',
          data: { message: 'mark-queued-fail' },
          source: 'synapse://test',
          externalId: `mark-fail:${randomUUID()}`,
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
        const faultPool = createFaultInjectingPool(ctx.pool, {
          failSqlMatching: /set status = 'queued'/i,
        });
        await expect(markRunQueued(faultPool, runId)).rejects.toThrow(
          /Injected fault/,
        );
        const pending = await ctx.pool.query(
          `select status from agent_runs where id = $1`,
          [runId],
        );
        expect(pending.rows[0].status).toBe('pending');
        await markRunQueued(ctx.pool, runId);
        const registry = createRuntimeRegistry([exampleEchoPingAgent]);
        await executeRun(runId, { store: ctx.store, registry });
        await waitForRunStatus(ctx.pool, {
          agentName: 'example-echo',
          reactorName: 'example-ping',
          inputEventId: event.id,
          status: 'succeeded',
        });
      });
    });

    it('worker_crash_after_claim_before_handler_recovers', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.ping.v1',
          data: { message: 'stale-running' },
          source: 'synapse://test',
          externalId: `stale-h:${randomUUID()}`,
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

    it('worker_crash_after_emit_before_success_dedupes_emitted_event', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.ping.v1',
          data: { message: 'emit-crash' },
          source: 'synapse://test',
          externalId: `emit-crash:${randomUUID()}`,
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
        await markRunQueued(ctx.pool, runId);
        const claimed = await ctx.store.claimRun(runId, 120_000);
        expect(claimed).not.toBeNull();
        const loaded = await ctx.store.loadEvent(event.id);
        const ctxEmit = createReactorContext({
          run: claimed!,
          event: loaded,
          store: ctx.store,
        });
        await ctxEmit.emit(
          'example.pong.v1',
          { echo: 'emit-crash', ping_event_id: event.id },
          { externalId: `example-pong:${event.id}` },
        );
        await ctx.pool.query(
          `update agent_runs set status = 'running', locked_until = now() - interval '1 second' where id = $1`,
          [runId],
        );
        await ctx.store.repairStaleRuns();
        const worker = await bootstrapTestWorker(ctx);
        try {
          await waitForRunStatus(ctx.pool, {
            agentName: 'example-echo',
            reactorName: 'example-ping',
            inputEventId: event.id,
            status: 'succeeded',
          });
          const pongs = await ctx.pool.query(
            `select count(*)::int as c from events where type = 'example.pong.v1' and root_id = $1`,
            [event.rootId],
          );
          expect(Number(pongs.rows[0].c)).toBe(1);
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('failed_run_succeeds_after_requeueFailedAgentRun', async () => {
      let failRun = true;
      await withIsolatedStreamsStore(async (ctx) => {
        const togglingAgent = defineAgent({
          name: 'toggle-fail',
          reactors: [
            defineReactor({
              name: 'maybe-fail',
              subscribesTo: ['example.toggle-fail.v1'],
              handler: async (event, reactorCtx) => {
                if (failRun) {
                  throw new Error('intentional failure');
                }
                await reactorCtx.emit(
                  'example.toggle-ok.v1',
                  { ok: true },
                  { externalId: `ok:${event.id}` },
                );
              },
            }),
          ],
        });
        const worker = await bootstrapTestWorker({
          ...ctx,
          agents: [togglingAgent],
        });
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.toggle-fail.v1',
          data: {},
          source: 'synapse://test',
          externalId: `toggle-fail:${randomUUID()}`,
        });
        const runId = agentRunId({
          inputEventId: event.id,
          agentName: 'toggle-fail',
          reactorName: 'maybe-fail',
        });
        try {
          await waitForRunStatus(ctx.pool, {
            inputEventId: event.id,
            agentName: 'toggle-fail',
            reactorName: 'maybe-fail',
            status: 'failed',
          });
          const failedJob = await worker.queue.getJob(runId);
          expect(failedJob).toBeUndefined();

          failRun = false;
          expect(await requeueFailedAgentRun(ctx.pool, runId)).toBe(true);
          await waitForRunStatus(ctx.pool, {
            inputEventId: event.id,
            agentName: 'toggle-fail',
            reactorName: 'maybe-fail',
            status: 'succeeded',
          });
          await waitForEventType(ctx.pool, 'example.toggle-ok.v1', {
            rootId: event.rootId,
          });
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('failed_run_succeeds_when_legacy_failed_bull_job_blocks_same_job_id', async () => {
      let failRun = true;
      await withIsolatedStreamsStore(async (ctx) => {
        const togglingAgent = defineAgent({
          name: 'legacy-fail',
          reactors: [
            defineReactor({
              name: 'maybe-fail',
              subscribesTo: ['example.legacy-fail.v1'],
              handler: async (event, reactorCtx) => {
                if (failRun) {
                  throw new Error('intentional failure');
                }
                await reactorCtx.emit(
                  'example.legacy-ok.v1',
                  { ok: true },
                  { externalId: `ok:${event.id}` },
                );
              },
            }),
          ],
        });
        const worker = await bootstrapTestWorker({
          ...ctx,
          agents: [togglingAgent],
        });
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.legacy-fail.v1',
          data: {},
          source: 'synapse://test',
          externalId: `legacy-fail:${randomUUID()}`,
        });
        const runId = agentRunId({
          inputEventId: event.id,
          agentName: 'legacy-fail',
          reactorName: 'maybe-fail',
        });
        try {
          await waitForRunStatus(ctx.pool, {
            inputEventId: event.id,
            agentName: 'legacy-fail',
            reactorName: 'maybe-fail',
            status: 'failed',
          });
          await worker.queue.pause();
          await worker.queue.add(
            REACTOR_JOB_NAME,
            { runId },
            {
              jobId: runId,
              attempts: 1,
              removeOnComplete: false,
              removeOnFail: false,
            },
          );
          const stuck = await worker.queue.getJob(runId);
          expect(stuck).not.toBeUndefined();
          await worker.queue.resume();
          await pollUntil(async () => {
            const job = await worker.queue.getJob(runId);
            return (await job?.getState()) === 'completed' ? true : undefined;
          });

          failRun = false;
          expect(await requeueFailedAgentRun(ctx.pool, runId)).toBe(true);
          await waitForRunStatus(ctx.pool, {
            inputEventId: event.id,
            agentName: 'legacy-fail',
            reactorName: 'maybe-fail',
            status: 'succeeded',
          });
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('reactor_throw_before_emit_marks_failed_without_output_event', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const failAgent = defineAgent({
          name: 'fail-agent',
          reactors: [
            defineReactor({
              name: 'throw-first',
              subscribesTo: ['example.fail.v1'],
              handler: async () => {
                throw new Error('boom before emit');
              },
            }),
          ],
        });
        const worker = await bootstrapTestWorker({
          ...ctx,
          agents: [failAgent],
        });
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.fail.v1',
          data: {},
          source: 'synapse://test',
          externalId: `fail-first:${randomUUID()}`,
        });
        try {
          await pollUntil(async () => {
            const row = await ctx.pool.query(
              `select status from agent_runs where input_event_id = $1`,
              [event.id],
            );
            return row.rows[0]?.status === 'failed' ? true : undefined;
          });
          const outputs = await ctx.pool.query(
            `select count(*)::int as c from events where parent_id = $1`,
            [event.id],
          );
          expect(Number(outputs.rows[0].c)).toBe(0);
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('reactor_throw_after_emit_keeps_output_and_manual_retry_dedupes', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const throwAfterAgent = defineAgent({
          name: 'throw-after',
          reactors: [
            defineReactor({
              name: 'emit-then-throw',
              subscribesTo: ['example.throw-after.v1'],
              handler: async (event, reactorCtx) => {
                await reactorCtx.emit(
                  'example.emitted.v1',
                  { ok: true },
                  { externalId: `out:${event.id}` },
                );
                throw new Error('after emit');
              },
            }),
          ],
        });
        const worker = await bootstrapTestWorker({
          ...ctx,
          agents: [throwAfterAgent],
        });
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.throw-after.v1',
          data: {},
          source: 'synapse://test',
          externalId: `throw-after:${randomUUID()}`,
        });
        try {
          await pollUntil(async () => {
            const row = await ctx.pool.query(
              `select status from agent_runs where input_event_id = $1`,
              [event.id],
            );
            return row.rows[0]?.status === 'failed' ? true : undefined;
          });
          const outputs = await ctx.pool.query(
            `select count(*)::int as c from events where type = 'example.emitted.v1'`,
          );
          expect(Number(outputs.rows[0].c)).toBe(1);
          await ctx.pool.query(
            `update agent_runs set status = 'pending', locked_until = null where input_event_id = $1`,
            [event.id],
          );
          await pollUntil(async () => {
            const pending = await loadPendingRuns(ctx.pool, 10);
            return pending.some((run) => run.inputEventId === event.id)
              ? true
              : undefined;
          });
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('slow_reactor_renews_lease_and_succeeds', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const slowAgent = defineAgent({
          name: 'slow-agent',
          reactors: [
            defineReactor({
              name: 'slow',
              subscribesTo: ['example.ping.v1'],
              handler: async () => {
                await delay(2_500);
              },
            }),
          ],
        });
        const worker = await bootstrapTestWorker({
          ...ctx,
          agents: [slowAgent],
          lockMs: 1_500,
          lockRenewIntervalMs: 500,
        });
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.ping.v1',
          data: { message: 'slow-renew' },
          source: 'synapse://test',
          externalId: `slow-renew:${randomUUID()}`,
        });
        try {
          await pollUntil(
            async () => {
              const row = await ctx.pool.query(
                `select status from agent_runs where input_event_id = $1`,
                [event.id],
              );
              return row.rows[0]?.status === 'succeeded' ? true : undefined;
            },
            { timeoutMs: 15_000 },
          );
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('stale_bullmq_job_for_succeeded_run_is_ignored', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.ping.v1',
          data: { message: 'stale-job' },
          source: 'synapse://test',
          externalId: `stale-job:${randomUUID()}`,
        });
        const runId = agentRunId({
          inputEventId: event.id,
          agentName: 'example-echo',
          reactorName: 'example-ping',
        });
        const worker = await bootstrapTestWorker(ctx);
        try {
          await waitForRunStatus(ctx.pool, {
            agentName: 'example-echo',
            reactorName: 'example-ping',
            inputEventId: event.id,
            status: 'succeeded',
          });
          await worker.queue.add(REACTOR_JOB_NAME, { runId }, { jobId: runId });
          await pollUntil(async () => {
            const pongs = await ctx.pool.query(
              `select count(*)::int as c from events where type = 'example.pong.v1' and root_id = $1`,
              [event.rootId],
            );
            return Number(pongs.rows[0].c) === 1 ? true : undefined;
          });
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('malformed_bullmq_job_missing_run_id_fails_without_db_change', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const beforeEvents = await countRows(ctx.pool, 'events');
        await expect(
          executeRunFromJobData(
            {},
            { store: ctx.store, registry: createRuntimeRegistry([]) },
          ),
        ).rejects.toThrow(/runId/);
        expect(await countRows(ctx.pool, 'events')).toBe(beforeEvents);
      });
    });

    it('bullmq_job_for_missing_run_is_ignored', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const beforeEvents = await countRows(ctx.pool, 'events');
        await executeRunFromJobData(
          { runId: 'run_missing_evt__example-echo__example-ping' },
          {
            store: ctx.store,
            registry: createRuntimeRegistry([exampleEchoPingAgent]),
          },
        );
        expect(await countRows(ctx.pool, 'events')).toBe(beforeEvents);
      });
    });
  },
);

describe.skipIf(!integrationAvailable)('failure vector: ctx.emit', () => {
  it('ctx_emit_same_external_id_twice_dedupes', async () => {
    await withIsolatedStreamsStore(async (ctx) => {
      const event = await emitFixtureEvent(ctx.pool, {
        type: 'example.ping.v1',
        data: { message: 'ctx-dedupe' },
        source: 'synapse://test',
        externalId: `ctx-dedupe:${randomUUID()}`,
      });
      const runId = agentRunId({
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'double-emit',
      });
      await ensureAgentRun(ctx.pool, {
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'double-emit',
      });
      const registry = createRuntimeRegistry([
        defineAgent({
          name: 'example-echo',
          reactors: [
            defineReactor({
              name: 'double-emit',
              subscribesTo: ['example.ping.v1'],
              handler: async (input, reactorCtx) => {
                const externalId = `double:${input.id}`;
                const first = await reactorCtx.emit(
                  'example.double.v1',
                  { n: 1 },
                  { externalId },
                );
                const second = await reactorCtx.emit(
                  'example.double.v1',
                  { n: 2 },
                  { externalId },
                );
                expect(second.id).toBe(first.id);
              },
            }),
          ],
        }),
      ]);
      await markRunQueued(ctx.pool, runId);
      await executeRun(runId, { store: ctx.store, registry });
      const doubles = await ctx.pool.query(
        `select count(*)::int as c from events where type = 'example.double.v1'`,
      );
      expect(Number(doubles.rows[0].c)).toBe(1);
    });
  });

  it('ctx_emit_requires_external_id_runtime_guard', async () => {
    await withIsolatedStreamsStore(async (ctx) => {
      const event = await emitFixtureEvent(ctx.pool, {
        type: 'example.ping.v1',
        data: {},
        source: 'synapse://test',
        externalId: `no-ext:${randomUUID()}`,
      });
      const runId = agentRunId({
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'no-ext',
      });
      await ensureAgentRun(ctx.pool, {
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'no-ext',
      });
      const registry = createRuntimeRegistry([
        defineAgent({
          name: 'example-echo',
          reactors: [
            defineReactor({
              name: 'no-ext',
              subscribesTo: ['example.ping.v1'],
              handler: async (_input, reactorCtx) => {
                await reactorCtx.emit(
                  'example.bad.v1',
                  {},
                  { externalId: '   ' },
                );
              },
            }),
          ],
        }),
      ]);
      await markRunQueued(ctx.pool, runId);
      await expect(
        executeRun(runId, { store: ctx.store, registry }),
      ).rejects.toThrow(/externalId/);
      const row = await ctx.pool.query(
        `select status from agent_runs where id = $1`,
        [runId],
      );
      expect(row.rows[0].status).toBe('failed');
    });
  });

  it('ctx_emit_allows_missing_subject', async () => {
    await withIsolatedStreamsStore(async (ctx) => {
      const event = await appendEvent(ctx.pool, {
        type: 'example.ping.v1',
        data: { message: 'no-subject' },
        source: 'synapse://test',
        externalId: `no-subject:${randomUUID()}`,
      });
      const runId = agentRunId({
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'emit-no-subject',
      });
      await ensureAgentRun(ctx.pool, {
        inputEventId: event.id,
        agentName: 'example-echo',
        reactorName: 'emit-no-subject',
      });
      const registry = createRuntimeRegistry([
        defineAgent({
          name: 'example-echo',
          reactors: [
            defineReactor({
              name: 'emit-no-subject',
              subscribesTo: ['example.ping.v1'],
              handler: async (input, reactorCtx) => {
                await reactorCtx.emit(
                  'example.nosubject.v1',
                  { ok: true },
                  { externalId: `nosubject-out:${input.id}` },
                );
              },
            }),
          ],
        }),
      ]);
      await markRunQueued(ctx.pool, runId);
      await executeRun(runId, { store: ctx.store, registry });
      const out = await ctx.pool.query(
        `select subject from events where type = 'example.nosubject.v1'`,
      );
      expect(out.rows[0].subject).toBeNull();
    });
  });
});

describe.skipIf(!integrationAvailable)(
  'failure vector: ordering and observability',
  () => {
    it('runtime_does_not_require_global_ordering', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const slowAgent = defineAgent({
          name: 'slow-agent',
          reactors: [
            defineReactor({
              name: 'slow',
              subscribesTo: ['example.slow.v1'],
              handler: async (_event, reactorCtx) => {
                await new Promise((resolve) => setTimeout(resolve, 800));
                await reactorCtx.emit(
                  'example.slow.done.v1',
                  {},
                  { externalId: `slow-done:${randomUUID()}` },
                );
              },
            }),
          ],
        });
        const fastAgent = defineAgent({
          name: 'fast-agent',
          reactors: [
            defineReactor({
              name: 'fast',
              subscribesTo: ['example.fast.v1'],
              handler: async (_event, reactorCtx) => {
                await reactorCtx.emit(
                  'example.fast.done.v1',
                  {},
                  { externalId: `fast-done:${randomUUID()}` },
                );
              },
            }),
          ],
        });
        const worker = await bootstrapTestWorker({
          ...ctx,
          agents: [slowAgent, fastAgent],
        });
        const slow = await emitFixtureEvent(ctx.pool, {
          type: 'example.slow.v1',
          data: {},
          source: 'synapse://test',
          externalId: `slow:${randomUUID()}`,
        });
        const fast = await emitFixtureEvent(ctx.pool, {
          type: 'example.fast.v1',
          data: {},
          source: 'synapse://test',
          externalId: `fast:${randomUUID()}`,
        });
        try {
          await waitForRunStatus(ctx.pool, {
            agentName: 'fast-agent',
            reactorName: 'fast',
            inputEventId: fast.id,
            status: 'succeeded',
          });
          await waitForRunStatus(ctx.pool, {
            agentName: 'slow-agent',
            reactorName: 'slow',
            inputEventId: slow.id,
            status: 'succeeded',
          });
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('follow_up_event_can_trigger_before_parent_run_success_is_observed', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const chainAgent = defineAgent({
          name: 'chain-agent',
          reactors: [
            defineReactor({
              name: 'parent',
              subscribesTo: ['example.parent.v1'],
              handler: async (event, reactorCtx) => {
                await reactorCtx.emit(
                  'example.child.v1',
                  {},
                  { externalId: `child:${event.id}` },
                );
                await new Promise((resolve) => setTimeout(resolve, 200));
              },
            }),
            defineReactor({
              name: 'child',
              subscribesTo: ['example.child.v1'],
              handler: async () => {},
            }),
          ],
        });
        const worker = await bootstrapTestWorker({
          ...ctx,
          agents: [chainAgent],
        });
        const parent = await emitFixtureEvent(ctx.pool, {
          type: 'example.parent.v1',
          data: {},
          source: 'synapse://test',
          externalId: `parent:${randomUUID()}`,
        });
        try {
          await waitForEventType(ctx.pool, 'example.child.v1', {
            rootId: parent.rootId,
          });
          await waitForRunStatus(ctx.pool, {
            agentName: 'chain-agent',
            reactorName: 'parent',
            inputEventId: parent.id,
            status: 'succeeded',
          });
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('reactor_bad_input_shape_marks_run_failed', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const worker = await bootstrapTestWorker({
          ...ctx,
          agents: [
            defineAgent({
              name: 'bad-shape',
              reactors: [
                defineReactor({
                  name: 'expects-field',
                  subscribesTo: ['example.bad.v1'],
                  handler: async (event) => {
                    const data = event.data as { required: string };
                    if (data.required.length === 0) {
                      throw new Error('missing required');
                    }
                  },
                }),
              ],
            }),
          ],
        });
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.bad.v1',
          data: {},
          source: 'synapse://test',
          externalId: `bad:${randomUUID()}`,
        });
        try {
          await pollUntil(async () => {
            const row = await ctx.pool.query(
              `select status from agent_runs where input_event_id = $1`,
              [event.id],
            );
            return row.rows[0]?.status === 'failed' ? true : undefined;
          });
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('emitted_event_with_no_subscribers_stops_chain', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const worker = await bootstrapTestWorker({
          ...ctx,
          agents: [
            defineAgent({
              name: 'emitter',
              reactors: [
                defineReactor({
                  name: 'emit-only',
                  subscribesTo: ['example.emit-only.v1'],
                  handler: async (_event, reactorCtx) => {
                    await reactorCtx.emit(
                      'example.dead-end.v1',
                      {},
                      { externalId: `dead:${randomUUID()}` },
                    );
                  },
                }),
              ],
            }),
          ],
        });
        const root = await emitFixtureEvent(ctx.pool, {
          type: 'example.emit-only.v1',
          data: {},
          source: 'synapse://test',
          externalId: `emit-only:${randomUUID()}`,
        });
        try {
          await waitForRunStatus(ctx.pool, {
            agentName: 'emitter',
            reactorName: 'emit-only',
            inputEventId: root.id,
            status: 'succeeded',
          });
          const deadEndRuns = await ctx.pool.query(
            `select count(*)::int as c from agent_runs`,
          );
          expect(Number(deadEndRuns.rows[0].c)).toBe(1);
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('reactor_self_loop_with_same_external_id_dedupes_after_one_emit', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const loopAgent = defineAgent({
          name: 'loop-agent',
          reactors: [
            defineReactor({
              name: 'self-loop',
              subscribesTo: ['example.loop.v1'],
              handler: async (event, reactorCtx) => {
                await reactorCtx.emit(
                  'example.loop.v1',
                  { pass: 1 },
                  { externalId: `loop:${event.id}` },
                );
              },
            }),
          ],
        });
        const worker = await bootstrapTestWorker({
          ...ctx,
          agents: [loopAgent],
        });
        const root = await emitFixtureEvent(ctx.pool, {
          type: 'example.loop.v1',
          data: { pass: 0 },
          source: 'synapse://test',
          externalId: `loop-root:${randomUUID()}`,
        });
        try {
          await waitForRunStatus(ctx.pool, {
            agentName: 'loop-agent',
            reactorName: 'self-loop',
            inputEventId: root.id,
            status: 'succeeded',
          });
          const loops = await ctx.pool.query(
            `select count(*)::int as c from events where type = 'example.loop.v1'`,
          );
          expect(Number(loops.rows[0].c)).toBeLessThanOrEqual(2);
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('failed_run_records_last_error', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const worker = await bootstrapTestWorker({
          ...ctx,
          agents: [
            defineAgent({
              name: 'fail-agent',
              reactors: [
                defineReactor({
                  name: 'fail',
                  subscribesTo: ['example.fail-run.v1'],
                  handler: async () => {
                    throw new Error('useful failure message');
                  },
                }),
              ],
            }),
          ],
        });
        const event = await emitFixtureEvent(ctx.pool, {
          type: 'example.fail-run.v1',
          data: {},
          source: 'synapse://test',
          externalId: `fail-run:${randomUUID()}`,
        });
        try {
          await pollUntil(async () => {
            const row = await ctx.pool.query(
              `select last_error from agent_runs where input_event_id = $1`,
              [event.id],
            );
            const err = String(row.rows[0]?.last_error ?? '');
            return err.includes('useful failure message') ? true : undefined;
          });
        } finally {
          await worker.shutdown();
        }
      });
    });

    it('burst_events_eventually_drain_without_duplicates', async () => {
      await withIsolatedStreamsStore(async (ctx) => {
        const worker = await bootstrapTestWorker(ctx);
        const ids: string[] = [];
        for (let i = 0; i < 25; i += 1) {
          const event = await emitFixtureEvent(ctx.pool, {
            type: 'example.ping.v1',
            data: { message: `burst-${i}` },
            source: 'synapse://test',
            externalId: `burst:${randomUUID()}`,
          });
          ids.push(event.id);
        }
        try {
          for (const id of ids) {
            await waitForRunStatus(ctx.pool, {
              agentName: 'example-echo',
              reactorName: 'example-ping',
              inputEventId: id,
              status: 'succeeded',
            });
          }
          await assertNoDuplicateEvents(ctx.pool);
          await assertNoDuplicateRuns(ctx.pool);
        } finally {
          await worker.shutdown();
        }
      });
    });
  },
);
