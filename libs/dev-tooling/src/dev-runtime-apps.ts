import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { RuntimeConfig } from 'runtime-config';

/** BullMQ queue for streams reactor runs (single shared queue). */
export const DEV_RUNTIME_WORKER_QUEUE_NAME = 'reactor-runs';

/** Substrings matched by `pgrep -fl` against `npm run dev` child processes. */
export const DEV_RUNTIME_PROCESS_PATTERNS = {
  worker: 'worker:start',
} as const;

export type DevRuntimeAppName = keyof typeof DEV_RUNTIME_PROCESS_PATTERNS;

export type DevRuntimeAppsStatus = Record<DevRuntimeAppName, boolean>;

export class DevRuntimeAppsNotRunningError extends Error {
  readonly missing: readonly DevRuntimeAppName[];

  constructor(missing: readonly DevRuntimeAppName[]) {
    const lines = missing.map((name) => describeMissingApp(name));
    super(
      [
        'Runtime worker is not ready (no BullMQ consumers on the reactor queue). For fixture-driven runs use `npm run dev` then `npm run dev:once`; ensure the stack is healthy with `npm run dev:infra:doctor`.',
        '',
        'Not ready:',
        ...lines.map((line) => `  - ${line}`),
        '',
        'Start runtime: npm run dev',
        'Start infra first: npm run dev:infra && npm run dev:infra:doctor',
      ].join('\n'),
    );
    this.name = 'DevRuntimeAppsNotRunningError';
    this.missing = missing;
  }
}

export type DevRuntimeAppsDeps = {
  probeWorkerQueue: (redisUrl: string, queueName: string) => Promise<boolean>;
  delayMs: (ms: number) => Promise<void>;
  workerProbeAttempts: number;
  workerProbeDelayMs: number;
};

const execFileAsync = promisify(execFile);

const defaultDeps: DevRuntimeAppsDeps = {
  probeWorkerQueue: probeWorkerBullMqConsumers,
  delayMs: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  workerProbeAttempts: 5,
  workerProbeDelayMs: 400,
};

function describeMissingApp(_name: DevRuntimeAppName): string {
  return `worker: no BullMQ consumers on queue ${DEV_RUNTIME_WORKER_QUEUE_NAME}`;
}

export async function probeDevRuntimeApps(
  config: RuntimeConfig,
  deps: DevRuntimeAppsDeps = defaultDeps,
): Promise<DevRuntimeAppsStatus> {
  const worker = await probeWorkerWithRetry(
    config.redisUrl,
    DEV_RUNTIME_WORKER_QUEUE_NAME,
    deps,
  );
  return { worker };
}

export async function assertDevRuntimeAppsRunning(
  config: RuntimeConfig,
  deps: DevRuntimeAppsDeps = defaultDeps,
): Promise<void> {
  const status = await probeDevRuntimeApps(config, deps);
  const missing = (Object.entries(status) as [DevRuntimeAppName, boolean][])
    .filter(([, up]) => !up)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new DevRuntimeAppsNotRunningError(missing);
  }
}

async function probeWorkerWithRetry(
  redisUrl: string,
  queueName: string,
  deps: DevRuntimeAppsDeps,
): Promise<boolean> {
  for (let attempt = 0; attempt < deps.workerProbeAttempts; attempt += 1) {
    if (await deps.probeWorkerQueue(redisUrl, queueName)) {
      return true;
    }
    if (attempt < deps.workerProbeAttempts - 1) {
      await deps.delayMs(deps.workerProbeDelayMs);
    }
  }
  return false;
}

export async function probeProcessPattern(pattern: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('pgrep', ['-fl', pattern], {
      encoding: 'utf8',
    });
    return stdout.trim().length > 0;
  } catch (error) {
    if (isExecNotFound(error)) {
      return false;
    }
    throw error;
  }
}

export async function probeWorkerBullMqConsumers(
  redisUrl: string,
  queueName: string,
): Promise<boolean> {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(queueName, { connection });
  try {
    const count = await queue.getWorkersCount();
    return count >= 1;
  } finally {
    await queue.close();
    await connection.quit();
  }
}

function isExecNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const { code } = error as { code?: string | number };
  return code !== undefined && String(code) === '1';
}
