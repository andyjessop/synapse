import type {
  AgentDefinition,
  AgentHandler,
  AgentSqliteDefinition,
} from 'runtime-agent';
import { assertAgentNameSqliteSlug } from 'runtime-agent-sqlite';
import type { ValidatedRuntimeManifest } from './validate.js';
import { MANIFEST_HANDLER_REACTOR_NAME } from './validate.js';

export type RegisteredManifestAgent = {
  agentName: string;
  reactorName: typeof MANIFEST_HANDLER_REACTOR_NAME;
  handler: AgentHandler;
  handles: readonly string[];
  agentSqlite?: AgentSqliteDefinition;
  manifestName: string;
  manifestPath: string;
};

export type ManifestRuntimeRegistry = {
  manifestName: string;
  manifestPath: string;
  findAgentsForEvent(eventType: string): RegisteredManifestAgent[];
  getAgent(agentName: string, reactorName?: string): RegisteredManifestAgent;
  /** @deprecated Use {@link findAgentsForEvent}. */
  matchReactors(eventType: string): RegisteredManifestAgent[];
  /** @deprecated Use {@link getAgent}. */
  getReactor(agentName: string, reactorName: string): RegisteredManifestAgent;
};

export function createRuntimeRegistryFromManifest(input: {
  manifest: ValidatedRuntimeManifest;
  handlers: Map<string, AgentHandler>;
  shippedAgents: ReadonlyMap<string, AgentDefinition>;
  agentSqliteByAgent?: ReadonlyMap<string, AgentSqliteDefinition>;
}): ManifestRuntimeRegistry {
  const byEventType = new Map<string, RegisteredManifestAgent[]>();
  const byAgent = new Map<string, RegisteredManifestAgent>();

  for (const entry of input.manifest.agents) {
    assertAgentNameSqliteSlug(entry.name);
    const agentDef = input.shippedAgents.get(entry.name);
    if (agentDef === undefined) {
      throw new Error(`Missing shipped agent definition: ${entry.name}`);
    }
    const handler = input.handlers.get(entry.name);
    if (handler === undefined) {
      throw new Error(`Missing resolved handler for ${entry.name}`);
    }
    const registered: RegisteredManifestAgent = {
      agentName: entry.name,
      reactorName: MANIFEST_HANDLER_REACTOR_NAME,
      handler,
      handles: agentDef.handles,
      manifestName: input.manifest.name,
      manifestPath: input.manifest.manifestPath,
      ...(input.agentSqliteByAgent?.has(entry.name)
        ? { agentSqlite: input.agentSqliteByAgent.get(entry.name) }
        : agentDef.agentSqlite !== undefined
          ? { agentSqlite: agentDef.agentSqlite }
          : {}),
    };
    byAgent.set(entry.name, registered);
    for (const eventType of agentDef.handles) {
      const list = byEventType.get(eventType) ?? [];
      list.push(registered);
      byEventType.set(eventType, list);
    }
  }

  const registry: ManifestRuntimeRegistry = {
    manifestName: input.manifest.name,
    manifestPath: input.manifest.manifestPath,
    findAgentsForEvent: (eventType) => byEventType.get(eventType) ?? [],
    getAgent: (agentName, reactorName = MANIFEST_HANDLER_REACTOR_NAME) => {
      if (reactorName !== MANIFEST_HANDLER_REACTOR_NAME) {
        throw new Error(
          `Missing agent registration: ${agentName}/${reactorName} (manifest ${input.manifest.name})`,
        );
      }
      const registered = byAgent.get(agentName);
      if (registered === undefined) {
        throw new Error(
          `Missing agent registration: ${agentName} (manifest ${input.manifest.name})`,
        );
      }
      return registered;
    },
    matchReactors: (eventType) => byEventType.get(eventType) ?? [],
    getReactor: (agentName, reactorName) => {
      if (reactorName !== MANIFEST_HANDLER_REACTOR_NAME) {
        throw new Error(
          `Missing agent registration: ${agentName}/${reactorName} (manifest ${input.manifest.name})`,
        );
      }
      const registered = byAgent.get(agentName);
      if (registered === undefined) {
        throw new Error(
          `Missing agent registration: ${agentName} (manifest ${input.manifest.name})`,
        );
      }
      return registered;
    },
  };

  return registry;
}
