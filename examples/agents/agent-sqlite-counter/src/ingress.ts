import { randomUUID } from 'node:crypto';

import type { SynapseEvent } from 'runtime-agent';
import type { RuntimePool } from 'runtime-store';
import { createIngressContext } from 'runtime-worker';

import { SQLITE_COUNTER_AGENT_NAME } from './agent.js';

export const SQLITE_COUNTER_INGRESS_SOURCE =
  'synapse://example/sqlite-counter' as const;

export type TriggerSqliteCounterInput = {
  pool: RuntimePool;
  pingToken?: string;
  /** When set, this event shares the trace root (see `appendEvent` `rootId` / `parentId`). */
  traceRootId?: string;
  parentEventId?: string;
};

/** Default `ping_token` when callers omit it (unit-tested for coverage). */
export function defaultPingTokenIfUnset(pingToken: string | undefined): string {
  return pingToken ?? `once-${randomUUID()}`;
}

/** Emit `example.sqlite.count.requested.v1` (integration tests). */
export async function triggerSqliteCounterRequest(
  input: TriggerSqliteCounterInput,
): Promise<SynapseEvent> {
  const pingToken = defaultPingTokenIfUnset(input.pingToken);
  const ctx = createIngressContext({
    agent: SQLITE_COUNTER_AGENT_NAME,
    source: SQLITE_COUNTER_INGRESS_SOURCE,
    store: input.pool,
  });
  return ctx.emit(
    'example.sqlite.count.requested.v1',
    { ping_token: pingToken },
    {
      source: SQLITE_COUNTER_INGRESS_SOURCE,
      subject: pingToken,
      // Unique per emit: (source, external_id) dedupes; same ping_token must still create new requests.
      externalId: `sqlite-counter-req:${pingToken}:${randomUUID()}`,
      rootId: input.traceRootId,
      parentId: input.parentEventId,
    },
  );
}
