import { randomUUID } from 'node:crypto';

import type { SynapseEvent } from 'runtime-agent';
import type { RuntimePool } from 'runtime-store';
import { createIngressContext } from 'runtime-worker';

import { DIALOGUE_QUESTIONER_AGENT_NAME } from './questioner.js';

export const DIALOGUE_INGRESS_SOURCE =
  'synapse://example/agent-dialogue/ingress' as const;

export type TriggerDialogueInput = {
  pool: RuntimePool;
  text?: string;
};

/** Emit `chat.question.v1` to start a cross-agent dialogue. */
export async function triggerDialogue(
  input: TriggerDialogueInput,
): Promise<SynapseEvent> {
  const token = randomUUID();
  const text = input.text ?? 'How do multiple agents share one event trace?';
  const ctx = createIngressContext({
    agent: DIALOGUE_QUESTIONER_AGENT_NAME,
    source: DIALOGUE_INGRESS_SOURCE,
    store: input.pool,
  });
  return ctx.emit(
    'chat.question.v1',
    { text },
    {
      source: DIALOGUE_INGRESS_SOURCE,
      subject: token,
      externalId: `chat-question:${token}`,
    },
  );
}
