import { reviewPrAgent } from 'agent-reviewer/definition';
import { exampleEchoAgent } from 'example-agent-echo/definition';

import type { AgentDefinition } from 'runtime-agent';

export const shippedAgents = [reviewPrAgent, exampleEchoAgent] as const;

export const shippedAgentsByName = new Map<string, AgentDefinition>(
  shippedAgents.map((agent) => [agent.name, agent]),
);
