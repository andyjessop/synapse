export {
  type AgentContext,
  type AgentHandler,
  defineAgentHandler,
  isAgentHandler,
} from './agent-handler.js';
export type {
  AgentSqliteDb,
  AgentSqliteDefinition,
  SqliteExecResult,
  SqliteMigration,
} from './sqlite.js';
export type { SynapseEvent } from './synapse-event.js';

export type AgentSqliteFailureKind =
  | 'agent_sqlite_open_failed'
  | 'agent_sqlite_migration_failed'
  | 'agent_sqlite_migration_drift'
  | 'agent_sqlite_agent_mismatch'
  | 'agent_sqlite_result_limit_exceeded'
  | 'agent_sqlite_query_failed';

/** Extend as other subsystems adopt failure_detail. */
export type RunFailureKind = AgentSqliteFailureKind | (string & {});

export type RunFailureDetail = {
  kind: RunFailureKind;
  retryable: boolean;
  subsystem?: 'agent_sqlite' | 'reactor' | 'runtime';
  agentName?: string;
  reactorName?: string;
  migrationId?: string;
  bundleHash?: string;
  message: string;
};

import type { AgentSqliteDb, AgentSqliteDefinition } from './sqlite.js';
import type { SynapseEvent } from './synapse-event.js';

export type ReactorContext = {
  agentName: string;
  reactorName: string;
  input: SynapseEvent;
  run: {
    id: string;
    attempt: number;
  };
  emit: (
    type: string,
    data: unknown,
    options: {
      externalId: string;
      subject?: string;
    },
  ) => Promise<SynapseEvent>;
  /** Present iff agent definition included `sqlite`. */
  db?: AgentSqliteDb;
  /**
   * Returns `db` when SQLite is wired for this run; otherwise throws a clear programming error.
   */
  requireDb(): AgentSqliteDb;
};

/** @deprecated Use {@link AgentHandler} default-export functions from manifest handler modules. */
export type ReactorDefinition<TEvent extends SynapseEvent = SynapseEvent> = {
  name: string;
  subscribesTo: readonly string[];
  handler: (event: TEvent, ctx: ReactorContext) => Promise<void>;
};

export type AgentDefinition = {
  name: string;
  sqlite?: AgentSqliteDefinition;
  reactors: readonly ReactorDefinition[];
};

/** @deprecated Subscriptions belong in runtime manifests; use {@link defineAgentHandler}. */
export function defineReactor<TEvent extends SynapseEvent>(
  reactor: ReactorDefinition<TEvent>,
): ReactorDefinition<TEvent> {
  return reactor;
}

export function defineAgent(agent: AgentDefinition): AgentDefinition {
  return agent;
}
