import { randomUUID } from 'node:crypto';

import type { SynapseEvent } from 'runtime-agent';
import type { RuntimePool } from 'runtime-store';
import { createIngressContext } from 'runtime-worker';

import { SPLITTER_AGENT_NAME } from './agent.js';

export const SPLITTER_INGRESS_SOURCE =
  'synapse://example/agent-splitter/ingress' as const;

export type TriggerBroadcastInput = {
  pool: RuntimePool;
  message?: string;
};

export async function triggerBroadcast(
  input: TriggerBroadcastInput,
): Promise<SynapseEvent> {
  const token = randomUUID();
  const message = input.message ?? 'hello team';
  const ctx = createIngressContext({
    agent: SPLITTER_AGENT_NAME,
    source: SPLITTER_INGRESS_SOURCE,
    store: input.pool,
  });
  return ctx.emit(
    'notify.broadcast.v1',
    { message },
    {
      source: SPLITTER_INGRESS_SOURCE,
      subject: token,
      externalId: `notify-broadcast:${token}`,
    },
  );
}
