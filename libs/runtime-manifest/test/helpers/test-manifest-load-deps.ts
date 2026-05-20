import { reviewPrAgent } from 'agent-reviewer/definition';
import { exampleEchoAgent } from 'example-agent-echo/definition';
import type { AgentDefinition } from 'runtime-agent';
import { eventRegistry } from 'runtime-events';

export const testShippedAgentsByName = new Map<string, AgentDefinition>([
  [reviewPrAgent.name, reviewPrAgent],
  [exampleEchoAgent.name, exampleEchoAgent],
]);

export const testKnownEventTypes = new Set(Object.keys(eventRegistry));
