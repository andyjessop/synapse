import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { PoolClient } from 'pg';
import { defineAgent, defineReactor } from 'runtime-agent';
import { parseRuntimeConfig } from 'runtime-config';
import {
  type AgentRunStatus,
  type AppendEventInput,
  appendEvent,
  createRuntimeStore,
  createRuntimeStorePool,
  migrateRuntimeStore,
  type RuntimePool,
  type RuntimeStore,
  type SynapseEvent,
} from 'runtime-store';
import {
  createRuntimeRegistry,
  executeRunFromJobData,
  REACTOR_JOB_NAME,
  REACTOR_QUEUE_NAME,
  type RuntimeLogger,
  type RuntimeRegistry,
  type StreamSubscription,
  startPlanningStream,
  startQueueingStream,
  startRepairStream,
} from '../../src/index';

export const DEFAULT_INTEGRATION_DATABASE_URL =
  process.env.RUNTIME_INTEGRATION_DATABASE_URL ??
  'postgresql://synapse:synapse@127.0.0.1:25432/synapse';
export const DEFAULT_INTEGRATION_REDIS_URL =
  process.env.RUNTIME_INTEGRATION_REDIS_URL ?? 'redis://127.0.0.1:26379';

/** BullMQ worker/queue shutdown can race ioredis `quit`; swallow benign close errors. */
export async function closeRedisClient(redis: IORedis): Promise<void> {
  try {
    await redis.quit();
  } catch {
    // ignore
  }
}

export function redisUrlForSchema(baseUrl: string, schema: string): string {
  const db =
    1 +
    (Array.from(schema).reduce((sum, char) => sum + char.charCodeAt(0), 0) %
      14);
  const url = new URL(baseUrl);
  url.pathname = `/${String(db)}`;
  return url.toString();
}

export type StreamsTestContext = {
  pool: RuntimePool;
  store: RuntimeStore;
  schema: string;
  databaseUrl: string;
  redisUrl: string;
};

const silentLogger: RuntimeLogger = {
  error: () => {},
  warn: () => {},
};

export const exampleEchoPingAgent = defineAgent({
  name: 'example-echo',
  reactors: [
    defineReactor({
      name: 'example-ping',
      subscribesTo: ['example.ping.v1'],
      handler: async (event, ctx) => {
        const data = event.data as { message?: unknown };
        await ctx.emit(
          'example.pong.v1',
          {
            echo: typeof data.message === 'string' ? data.message : '',
            ping_event_id: event.id,
          },
          { externalId: `example-pong:${event.id}` },
        );
      },
    }),
  ],
});

export async function probeIntegrationInfra(): Promise<boolean> {
  try {
    const pool = createRuntimeStorePool({
      databaseUrl: DEFAULT_INTEGRATION_DATABASE_URL,
      max: 1,
    });
    await pool.query('select 1');
    await pool.end();
    const redis = new IORedis(DEFAULT_INTEGRATION_REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: 2_000,
    });
    await redis.ping();
    await closeRedisClient(redis);
    return true;
  } catch {
    return false;
  }
}

export async function withIsolatedStreamsStore(
  run: (ctx: StreamsTestContext) => Promise<void>,
): Promise<void> {
  const { databaseUrl } = parseRuntimeConfig({
    ...process.env,
    DATABASE_URL: DEFAULT_INTEGRATION_DATABASE_URL,
  });
  const schema = `streams_test_${randomUUID().replaceAll('-', '_')}`;
  const admin = createRuntimeStorePool({ databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = createRuntimeStorePool({ databaseUrl, max: 8, schema });

  try {
    await migrateRuntimeStore(pool);
    await migrateRuntimeStore(pool);
    const store = createRuntimeStore(pool);
    await run({
      pool,
      store,
      schema,
      databaseUrl,
      redisUrl: redisUrlForSchema(DEFAULT_INTEGRATION_REDIS_URL, schema),
    });
  } finally {
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
}

export async function resetRedis(redisUrl: string): Promise<void> {
  const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  try {
    await redis.flushdb();
  } finally {
    await closeRedisClient(redis);
  }
}

export async function emitFixtureEvent(
  pool: RuntimePool,
  input: AppendEventInput,
): Promise<SynapseEvent> {
  return appendEvent(pool, input);
}

export async function pollUntil<T>(
  probe: () => Promise<T | undefined>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 200;
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await probe();
    if (last !== undefined) {
      return last;
    }
    await delay(intervalMs);
  }
  throw new Error(`Timed out after ${timeoutMs}ms (last=${String(last)})`);
}

export async function waitForRunStatus(
  pool: RuntimePool,
  input: {
    agentName: string;
    reactorName: string;
    inputEventId: string;
    status: AgentRunStatus;
  },
): Promise<string> {
  const row = await pollUntil(async () => {
    const result = await pool.query(
      `
        select id, status, last_error
        from agent_runs
        where input_event_id = $1
          and agent_name = $2
          and reactor_name = $3
        limit 1
      `,
      [input.inputEventId, input.agentName, input.reactorName],
    );
    if (result.rowCount !== 1) {
      return undefined;
    }
    const status = String(result.rows[0].status);
    if (status === input.status) {
      return String(result.rows[0].id);
    }
    if (status === 'failed') {
      const err = result.rows[0].last_error;
      throw new Error(
        `Run failed for ${input.agentName}/${input.reactorName}: ${String(err)}`,
      );
    }
    return undefined;
  });
  return row;
}

export async function waitForEventType(
  pool: RuntimePool,
  type: string,
  options: { rootId?: string; since?: string } = {},
): Promise<SynapseEvent> {
  return pollUntil(async () => {
    const params: unknown[] = [type];
    let sql = `select * from events where type = $1`;
    if (options.rootId !== undefined) {
      params.push(options.rootId);
      sql += ` and root_id = $${params.length}`;
    }
    sql += ' order by created_at desc limit 1';
    const result = await pool.query(sql, params);
    if (result.rowCount !== 1) {
      return undefined;
    }
    const row = result.rows[0];
    return {
      id: String(row.id),
      type: String(row.type),
      source: String(row.source),
      externalId: String(row.external_id),
      subject: row.subject === null ? undefined : String(row.subject),
      data: row.data,
      rootId: String(row.root_id),
      parentId:
        row.parent_id === null || row.parent_id === undefined
          ? undefined
          : String(row.parent_id),
      createdAt: new Date(row.created_at).toISOString(),
    };
  });
}

export async function assertNoDuplicateEvents(
  pool: RuntimePool,
): Promise<void> {
  const result = await pool.query(
    `
      select source, external_id, count(*)::int as c
      from events
      group by source, external_id
      having count(*) > 1
    `,
  );
  if (result.rowCount > 0) {
    throw new Error(
      `Duplicate events: ${JSON.stringify(result.rows.slice(0, 5))}`,
    );
  }
}

export async function assertNoDuplicateRuns(pool: RuntimePool): Promise<void> {
  const result = await pool.query(
    `
      select input_event_id, agent_name, reactor_name, count(*)::int as c
      from agent_runs
      group by input_event_id, agent_name, reactor_name
      having count(*) > 1
    `,
  );
  if (result.rowCount > 0) {
    throw new Error(
      `Duplicate runs: ${JSON.stringify(result.rows.slice(0, 5))}`,
    );
  }
}

export type TestWorkerHandle = {
  shutdown(): Promise<void>;
  queue: Queue;
  connection: IORedis;
};

export async function bootstrapTestWorker(input: {
  store: RuntimeStore;
  pool: RuntimePool;
  redisUrl: string;
  agents?: ReturnType<typeof defineAgent>[];
  registry?: RuntimeRegistry;
  planningIntervalMs?: number;
  queueingIntervalMs?: number;
  repairIntervalMs?: number;
  lockMs?: number;
  lockRenewIntervalMs?: number;
  resetRedis?: boolean;
  streams?: boolean;
  agentSqlite?: {
    baseDir: string;
    lockTimeoutMs?: number;
    migrationMaxMsPerMigration?: number;
  };
}): Promise<TestWorkerHandle> {
  if (input.resetRedis !== false) {
    await resetRedis(input.redisUrl);
  }
  const registry =
    input.registry ??
    createRuntimeRegistry(input.agents ?? [exampleEchoPingAgent]);
  const queueConnection = new IORedis(input.redisUrl, {
    maxRetriesPerRequest: null,
  });
  const workerConnection = new IORedis(input.redisUrl, {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue(REACTOR_QUEUE_NAME, { connection: queueConnection });
  const subscriptions: StreamSubscription[] = [];
  if (input.streams !== false) {
    subscriptions.push(
      startPlanningStream({
        store: input.store,
        registry,
        logger: silentLogger,
        intervalMs: input.planningIntervalMs ?? 100,
      }),
      startQueueingStream({
        store: input.store,
        queue,
        logger: silentLogger,
        intervalMs: input.queueingIntervalMs ?? 100,
      }),
      startRepairStream({
        store: input.store,
        logger: silentLogger,
        intervalMs: input.repairIntervalMs ?? 500,
      }),
    );
  }
  const worker = new Worker(
    REACTOR_QUEUE_NAME,
    async (job) => {
      if (job.name !== REACTOR_JOB_NAME) {
        throw new Error(`Unexpected job name: ${job.name}`);
      }
      await executeRunFromJobData(job.data, {
        store: input.store,
        registry,
        pool: input.pool,
        agentSqlite:
          input.agentSqlite === undefined
            ? undefined
            : {
                baseDir: input.agentSqlite.baseDir,
                lockTimeoutMs: input.agentSqlite.lockTimeoutMs ?? 30_000,
                migrationMaxMsPerMigration:
                  input.agentSqlite.migrationMaxMsPerMigration ?? 300_000,
              },
        lockMs: input.lockMs,
        lockRenewIntervalMs: input.lockRenewIntervalMs,
      });
    },
    { connection: workerConnection, concurrency: 4 },
  );

  return {
    queue,
    connection: queueConnection,
    shutdown: async () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
      await delay(300);
      await worker.close();
      await queue.close();
      await closeRedisClient(workerConnection);
      await closeRedisClient(queueConnection);
    },
  };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function countRows(
  pool: RuntimePool,
  table: 'events' | 'agent_runs',
): Promise<number> {
  const result = await pool.query(`select count(*)::int as c from ${table}`);
  return Number(result.rows[0].c);
}

function wrapFaultClientQuery(
  client: PoolClient,
  options: { failSqlMatching: RegExp },
): void {
  const originalQuery = client.query.bind(client);
  client.query = function faultInjectingQuery(
    ...args: Parameters<PoolClient['query']>
  ): ReturnType<PoolClient['query']> {
    const first = args[0];
    const text =
      typeof first === 'string'
        ? first
        : typeof first === 'object' &&
            first !== null &&
            'text' in first &&
            typeof (first as { text?: unknown }).text === 'string'
          ? (first as { text: string }).text
          : String(first);
    if (options.failSqlMatching.test(text)) {
      client.query = originalQuery;
      const err = new Error(`Injected fault for SQL: ${text.slice(0, 80)}`);
      const last = args[args.length - 1];
      if (typeof last === 'function') {
        void Promise.resolve().then(() => (last as (e: Error) => void)(err));
        return undefined as ReturnType<PoolClient['query']>;
      }
      return Promise.reject(err) as ReturnType<PoolClient['query']>;
    }
    return originalQuery(...args) as ReturnType<PoolClient['query']>;
  } as PoolClient['query'];
}

export function createFaultInjectingPool(
  pool: RuntimePool,
  options: { failSqlMatching: RegExp },
): RuntimePool {
  const originalConnect = pool.connect.bind(pool);
  return new Proxy(pool, {
    get(target, prop, receiver) {
      if (prop === 'connect') {
        return function faultInjectingConnect(
          cb?: (err: Error | undefined, client?: PoolClient) => void,
        ): void | Promise<PoolClient> {
          if (typeof cb === 'function') {
            originalConnect((err: Error | undefined, client?: PoolClient) => {
              if (!err && client !== undefined) {
                wrapFaultClientQuery(client, options);
              }
              cb(err, client);
            });
            return;
          }
          return originalConnect().then((client: PoolClient) => {
            wrapFaultClientQuery(client, options);
            return client;
          });
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as RuntimePool;
}
