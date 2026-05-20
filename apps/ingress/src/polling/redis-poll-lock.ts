import { randomUUID } from 'node:crypto';

import IORedis from 'ioredis';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export type PollLockClient = Pick<
  IORedis,
  'set' | 'eval' | 'quit' | 'disconnect'
>;

export function createPollLockClient(redisUrl: string): PollLockClient {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null });
}

export async function acquirePollLock(
  redis: PollLockClient,
  lockKey: string,
  lockTtlMs: number,
): Promise<string | undefined> {
  const token = randomUUID();
  const result = await redis.set(lockKey, token, 'PX', lockTtlMs, 'NX');
  if (result === 'OK') {
    return token;
  }
  return undefined;
}

export async function releasePollLock(
  redis: PollLockClient,
  lockKey: string,
  token: string,
): Promise<void> {
  await redis.eval(RELEASE_SCRIPT, 1, lockKey, token);
}
