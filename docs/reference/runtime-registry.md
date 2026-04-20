---
title: Runtime registry
kind: reference
owner: runtime-agent
status: current
updated: 2026-05-20
freshness_triggers:
  - libs/runtime-agent/**
  - libs/runtime-manifest/**
  - manifests/**
---

# Runtime registry

## Scope

Agent and adapter registration validation, and how manifests produce a registry at worker startup.

## Contract

Primary sources:

- `libs/runtime-agent` — `defineAdapter`, `defineAgentHandler`, legacy `defineAgent` / `createRuntimeRegistry` (tests and unmigrated examples only)
- `libs/runtime-manifest` — `createRuntimeRegistryFromManifest`, `loadValidatedManifestRegistry`
- `apps/worker/src/manifest-registry.ts` — production wiring

**Shipped agents** register through **manifest JSON**, not `defineAgent` in worker TypeScript.

## Details

### Manifest-built registry

`loadValidatedManifestRegistry` parses manifest JSON, validates:

- Unique agent names
- Known event types in each `handles[]` entry
- Handler paths under allowed prefixes (`agents/`, `examples/agents/`)
- Default export is a valid agent handler

Then `wrapManifestRuntimeRegistry` supplies planning (`findAgentsForEvent`) and execution (`reactor` name **`handler`**).

### Legacy `createRuntimeRegistry`

Still used in tests and example packages not yet on manifests. `createRuntimeRegistry` fails fast on:

- Duplicate adapter or agent names
- Unknown event types in `owns` / `consumes` / `emits`
- `owns` mismatch with registry event owner
- Unauthorized `emits` (owner or `emitByProxy` for intents)
- Missing adapter/agent dependencies
- Cyclic `agents.uses`
- Invalid client handles

`AgentDefinition` fields include `events.owns`, `events.consumes`, `events.emits`, `adapters.uses`, `agents.uses`.

`AdapterDefinition` requires `name`, `externalSystem`, and Zod `configSchema`.

Do **not** use `defineAgent` / `defineReactor` for new application agents.

## Examples

**Manifest entry (authoritative for shipped agents):**

```json
{
  "name": "agent-reviewer",
  "handler": "agents/agent-reviewer/src/review-pr-agent.ts",
  "handles": ["pr.received.v1"]
}
```

**Handler module:**

```ts
import { defineAgentHandler } from 'runtime-agent';

export default defineAgentHandler(schema, async (ctx, event) => {
  // ...
});
```

## Related Pages

- [Runtime manifest](runtime-manifest.md)
- [Agents and adapters](../explanation/agents-and-adapters.md)
- [Create an agent](../how-to/create-an-agent.md)
