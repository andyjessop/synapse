import type { AgentHandler } from './agent-handler.js';
import type { AgentSqliteDefinition } from './sqlite.js';

/**
 * Must stay aligned with ADAPTER_SOURCE_ID_PATTERN in runtime-adapters.
 */
export const ADAPTER_SOURCE_ID_PATTERN =
  /^synapse\.adapters\.[a-z0-9-]+\.v[0-9]+$/;

/** Canonical Synapse event type shape (aligned with runtime-events). */
export const AGENT_HANDLE_PATTERN =
  /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.v[1-9][0-9]*$/;

const AGENT_NAME_PATTERN = /^(agent|example)-[a-z0-9-]+$/;

export type AgentDefinition = {
  readonly name: string;
  readonly handles: readonly string[];
  readonly usesAdapters?: readonly string[];
  readonly run: AgentHandler;
  readonly agentSqlite?: AgentSqliteDefinition;
};

export function defineAgent(definition: AgentDefinition): AgentDefinition {
  if (!AGENT_NAME_PATTERN.test(definition.name)) {
    throw new Error(
      `Invalid agent name: ${definition.name} (expected agent-* or example-*)`,
    );
  }
  if (definition.handles.length === 0) {
    throw new Error(
      `Agent ${definition.name} must handle at least one event type`,
    );
  }
  for (const handle of definition.handles) {
    if (!AGENT_HANDLE_PATTERN.test(handle)) {
      throw new Error(
        `Invalid event type handle for ${definition.name}: ${handle}`,
      );
    }
  }
  for (const source of definition.usesAdapters ?? []) {
    if (!ADAPTER_SOURCE_ID_PATTERN.test(source)) {
      throw new Error(
        `Invalid usesAdapters entry for ${definition.name}: ${source}`,
      );
    }
  }
  return definition;
}
