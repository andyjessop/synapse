import { randomUUID } from 'node:crypto';

import type { SynapseEvent } from 'runtime-agent';
import type { RuntimePool } from 'runtime-store';
import { createIngressContext } from 'runtime-worker';

import { PIPELINE_AGENT_NAME } from './agent.js';

export const PIPELINE_INGRESS_SOURCE =
  'synapse://example/agent-pipeline/ingress' as const;

export type TriggerPipelineInput = {
  pool: RuntimePool;
  payload?: string;
};

export async function triggerPipeline(
  input: TriggerPipelineInput,
): Promise<SynapseEvent> {
  const token = randomUUID();
  const payload = input.payload ?? 'alpha\n\nbeta\ngamma';
  const ctx = createIngressContext({
    agent: PIPELINE_AGENT_NAME,
    source: PIPELINE_INGRESS_SOURCE,
    store: input.pool,
  });
  return ctx.emit(
    'pipeline.raw.v1',
    { payload },
    {
      source: PIPELINE_INGRESS_SOURCE,
      subject: token,
      externalId: `pipeline-raw:${token}`,
    },
  );
}
