import type { z } from 'zod';

import type { AgentSqliteDb } from './sqlite.js';
import type { SynapseEvent } from './synapse-event.js';

export type AgentContext = {
  agentName: string;
  input: SynapseEvent;
  run: { id: string; attempt: number };
  emit: (
    type: string,
    data: unknown,
    options: { externalId: string; subject?: string },
  ) => Promise<SynapseEvent>;
  db?: AgentSqliteDb;
  requireDb(): AgentSqliteDb;
};

/** Default export must satisfy this at load time. */
export type AgentHandler = (
  ctx: AgentContext,
  event: SynapseEvent,
) => Promise<void>;

export function isAgentHandler(value: unknown): value is AgentHandler {
  return typeof value === 'function';
}

/**
 * Binds a handler-local Zod schema to event.data.
 * Infers TData for the inner fn; parses before business logic runs.
 */
export function defineAgentHandler<TData>(
  eventDataSchema: z.ZodType<TData>,
  fn: (ctx: AgentContext, event: SynapseEvent<TData>) => Promise<void>,
): AgentHandler {
  return async (ctx, event) => {
    const data = eventDataSchema.parse(event.data);
    await fn(ctx, { ...event, data });
  };
}
