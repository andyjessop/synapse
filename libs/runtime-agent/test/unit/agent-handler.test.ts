import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  type AgentContext,
  defineAgentHandler,
  isAgentHandler,
} from '../../src/agent-handler.js';

describe('defineAgentHandler', () => {
  it('parses event.data before invoking the inner handler', async () => {
    const schema = z.object({ n: z.number() });
    let seen: number | undefined;
    const handler = defineAgentHandler(schema, async (_ctx, event) => {
      seen = event.data.n;
    });
    expect(isAgentHandler(handler)).toBe(true);

    const ctx = {
      agentName: 'test',
      input: { id: 'e1', type: 't', data: { n: 1 } },
      run: { id: 'r1', attempt: 1 },
      adapters: { invoke: async () => ({}) },
      emit: async () => {
        throw new Error('not used');
      },
      requireDb: () => {
        throw new Error('not used');
      },
    } satisfies AgentContext;

    await handler(ctx, {
      id: 'e1',
      type: 't',
      source: 's',
      externalId: 'x',
      data: { n: 42 },
      rootId: 'e1',
      createdAt: new Date().toISOString(),
    });
    expect(seen).toBe(42);
  });
});
