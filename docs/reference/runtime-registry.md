---
title: Runtime registry
kind: reference
owner: runtime-agent
status: current
updated: 2026-05-21
freshness_triggers:
  - libs/runtime-agent/**
  - libs/runtime-manifest/**
  - apps/worker/src/shipped-agents.ts
  - apps/adapters/**
  - manifests/**
---

# Runtime registry

## Scope

Agent and adapter registration validation, and how manifests plus shipped definitions produce a registry at worker startup.

## Contract

Primary sources:

- `libs/runtime-agent` — `defineAgent`, `defineAgentHandler`, legacy `defineRegistryAgent` / `createRuntimeRegistry` (examples and unmigrated tests only)
- `libs/runtime-manifest` — `loadValidatedManifestRegistry`
- `apps/worker/src/shipped-agents.ts` — shipped `defineAgent` exports
- `apps/adapters/src/shipped-adapters.ts` — shipped `defineAdapterSource` exports

**Shipped agents** register through **`defineAgent`** + **`shipped-agents.ts`**, not handler paths on manifest JSON.

## Details

### Manifest-built registry

`loadValidatedManifestRegistry` parses manifest JSON and validates:

- Unique mounted agent names
- Each name exists in `shippedAgents` (`Map<string, AgentDefinition>`)
- Each definition’s `handles` ⊆ `knownEventTypes` (from `eventRegistry`)
- Each definition’s `usesAdapters` (if any) ⊆ manifest `adapters[].source`
- Scenario files on `scenarios[]` exist; ingress sources mounted; scenario adapter sources mounted

Then `wrapManifestRuntimeRegistry` supplies planning (`findAgentsForEvent`) and execution (reactor name **`handler`**).

### Shipped agent definition

```ts
import { defineAgent } from 'runtime-agent';

export const reviewPrAgent = defineAgent({
  name: 'agent-reviewer',
  handles: ['pr.received.v1'],
  usesAdapters: ['synapse.adapters.gitlab.v1'],
  run: runReviewPrAgent,
});
```

### Manifest mount (authoritative for session)

```json
{
  "agents": [{ "name": "agent-reviewer" }],
  "adapters": [{ "source": "synapse.adapters.gitlab.v1" }]
}
```

### Adapter runtime

`buildShippedAdapterRuntime(shippedAdapters)` in `apps/adapters` builds the method registry and live-deps factory. Agents invoke methods through **`ctx.adapters`** (HTTP to `apps/adapters`), not by importing adapter definitions.

### Legacy `createRuntimeRegistry`

Still used in tests and some example packages. Fails fast on duplicate names, unknown event types, ownership violations, and cyclic `agents.uses`.

Do **not** use `defineRegistryAgent` / `defineReactor` for new application agents.

## Examples

```ts
import { eventRegistry } from 'runtime-events';
import { shippedAgentsByName } from '../apps/worker/src/shipped-agents.js';

await loadValidatedManifestRegistry({
  repoRoot,
  manifestPath,
  shippedAgents: shippedAgentsByName,
  knownEventTypes: new Set(Object.keys(eventRegistry)),
});
```

## Related Pages

- [Runtime manifest](runtime-manifest.md)
- [Agents and adapters](../explanation/agents-and-adapters.md)
- [Create an agent](../how-to/create-an-agent.md)
- [Create an adapter](../how-to/create-an-adapter.md)
