import type { RuntimePool } from 'runtime-store';
import { wipeDevRuntimeStore } from 'runtime-store';

import { drainReactorQueue } from './drain-reactor-queue.js';

export async function wipeDevRuntime(input: {
  pool: RuntimePool;
  redisUrl: string;
}): Promise<void> {
  await wipeDevRuntimeStore(input.pool);
  await drainReactorQueue(input.redisUrl);
}
