import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { REACTOR_QUEUE_NAME } from 'runtime-worker';

/** Remove all BullMQ jobs on the reactor queue (local dev:once:clean). */
export async function drainReactorQueue(redisUrl: string): Promise<void> {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(REACTOR_QUEUE_NAME, { connection });
  try {
    await queue.obliterate({ force: true });
  } finally {
    await queue.close();
    await connection.quit();
  }
}
