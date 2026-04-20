import { randomUUID } from 'node:crypto';

/**
 * Worker lifecycle rows use the same value for CloudEvents `id` and `correlationid`
 * (shared CloudEvents id + correlationid pattern for lifecycle rows).
 */
export function workerLifecycleEnvelopeIds(): {
  id: string;
  correlationid: string;
} {
  const id = randomUUID();
  return { id, correlationid: id };
}
