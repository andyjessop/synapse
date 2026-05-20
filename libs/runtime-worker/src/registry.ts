import type {
  AgentHandler,
  AgentSqliteDefinition,
  ReactorDefinition,
  RegistryAgentDefinition,
} from 'runtime-agent';
import {
  assertAgentNameSqliteSlug,
  assertValidAgentSqliteDefinition,
} from 'runtime-agent-sqlite';
import type { ManifestRuntimeRegistry } from 'runtime-manifest';

export type RegisteredAgent = {
  agentName: string;
  reactorName: string;
  handler: AgentHandler;
  agentSqlite?: AgentSqliteDefinition;
  manifestName?: string;
  manifestPath?: string;
};

export type RuntimeRegistry = {
  manifestName?: string;
  manifestPath?: string;
  findAgentsForEvent(eventType: string): RegisteredAgent[];
  getAgent(agentName: string, reactorName: string): RegisteredAgent;
  /** @deprecated Use {@link findAgentsForEvent}. */
  matchReactors(eventType: string): RegisteredAgent[];
  /** @deprecated Use {@link getAgent}. */
  getReactor(agentName: string, reactorName: string): RegisteredAgent;
};

export function wrapManifestRuntimeRegistry(
  registry: ManifestRuntimeRegistry,
): RuntimeRegistry {
  return {
    manifestName: registry.manifestName,
    manifestPath: registry.manifestPath,
    findAgentsForEvent: (eventType) => registry.findAgentsForEvent(eventType),
    getAgent: (agentName, reactorName) =>
      registry.getAgent(agentName, reactorName),
    matchReactors: (eventType) => registry.matchReactors(eventType),
    getReactor: (agentName, reactorName) =>
      registry.getReactor(agentName, reactorName),
  };
}

export function createRuntimeRegistry(
  agents: readonly RegistryAgentDefinition[],
): RuntimeRegistry {
  const agentNames = new Set<string>();
  const byEventType = new Map<string, RegisteredAgent[]>();
  const byAgentAndReactor = new Map<string, RegisteredAgent>();

  for (const agent of agents) {
    if (agent.name.trim() === '') {
      throw new Error('Agent name must be non-empty');
    }
    assertAgentNameSqliteSlug(agent.name);
    if (agent.sqlite !== undefined) {
      assertValidAgentSqliteDefinition(agent.sqlite);
    }
    if (agentNames.has(agent.name)) {
      throw new Error(`Duplicate agent definition: ${agent.name}`);
    }
    agentNames.add(agent.name);

    const reactorNames = new Set<string>();
    for (const definition of agent.reactors) {
      if (definition.name.trim() === '') {
        throw new Error(`Reactor name must be non-empty for ${agent.name}`);
      }
      if (reactorNames.has(definition.name)) {
        throw new Error(
          `Duplicate reactor definition for ${agent.name}: ${definition.name}`,
        );
      }
      if (definition.subscribesTo.length === 0) {
        throw new Error(
          `Reactor ${agent.name}/${definition.name} must subscribe to at least one event type`,
        );
      }
      reactorNames.add(definition.name);

      const registered: RegisteredAgent = Object.assign(
        {
          agentName: agent.name,
          reactorName: definition.name,
          handler: reactorHandlerToAgentHandler(definition),
        },
        agent.sqlite === undefined ? {} : { agentSqlite: agent.sqlite },
      );
      byAgentAndReactor.set(
        registryKey(agent.name, definition.name),
        registered,
      );
      for (const eventType of definition.subscribesTo) {
        const registrations = byEventType.get(eventType) ?? [];
        registrations.push(registered);
        byEventType.set(eventType, registrations);
      }
    }
  }

  return buildRuntimeRegistry(byEventType, byAgentAndReactor);
}

function buildRuntimeRegistry(
  byEventType: Map<string, RegisteredAgent[]>,
  byAgentAndReactor: Map<string, RegisteredAgent>,
): RuntimeRegistry {
  return {
    findAgentsForEvent: (eventType) => byEventType.get(eventType) ?? [],
    getAgent: (agentName, reactorName) => {
      const registered = byAgentAndReactor.get(
        registryKey(agentName, reactorName),
      );
      if (registered === undefined) {
        throw new Error(
          `Missing agent registration: ${agentName}/${reactorName}`,
        );
      }
      return registered;
    },
    matchReactors: (eventType) => byEventType.get(eventType) ?? [],
    getReactor: (agentName, reactorName) => {
      const registered = byAgentAndReactor.get(
        registryKey(agentName, reactorName),
      );
      if (registered === undefined) {
        throw new Error(
          `Missing agent registration: ${agentName}/${reactorName}`,
        );
      }
      return registered;
    },
  };
}

function reactorHandlerToAgentHandler(
  definition: ReactorDefinition,
): AgentHandler {
  return async (ctx, event) => definition.handler(event, ctx as never);
}

function registryKey(agentName: string, reactorName: string): string {
  return `${agentName}\0${reactorName}`;
}
