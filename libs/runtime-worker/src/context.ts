import type { AdapterPort } from 'runtime-adapters';
import type {
  AgentContext,
  AgentSqliteDb,
  ReactorContext,
  SynapseEvent,
} from 'runtime-agent';
import type { AgentRun, RuntimeStore } from 'runtime-store';

export function createAgentContext(input: {
  run: AgentRun;
  event: SynapseEvent;
  store: RuntimeStore;
  db?: AgentSqliteDb;
  adapters: AdapterPort;
}): AgentContext {
  const db = input.db;
  return {
    agentName: input.run.agentName,
    input: input.event,
    run: {
      id: input.run.id,
      attempt: input.run.attemptCount,
    },
    adapters: input.adapters,
    emit: async (type, data, options) => {
      if (
        options === undefined ||
        typeof options.externalId !== 'string' ||
        options.externalId.trim() === ''
      ) {
        throw new Error('ctx.emit requires options.externalId');
      }

      return input.store.appendEvent({
        type,
        data,
        source: `agent://${input.run.agentName}/${input.run.reactorName}`,
        externalId: options.externalId,
        subject: options.subject ?? input.event.subject,
        rootId: input.event.rootId,
        parentId: input.event.id,
      });
    },
    db,
    requireDb(): AgentSqliteDb {
      if (db === undefined) {
        throw new Error(
          'requireDb(): no SQLite database wired for this agent run',
        );
      }
      return db;
    },
  };
}

/** @deprecated Use {@link createAgentContext}. */
export function createReactorContext(input: {
  run: AgentRun;
  event: SynapseEvent;
  store: RuntimeStore;
  db?: AgentSqliteDb;
  adapters: AdapterPort;
}): ReactorContext {
  const ctx = createAgentContext(input);
  return {
    ...ctx,
    reactorName: input.run.reactorName,
  };
}
