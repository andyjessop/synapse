---
title: Create an agent
kind: how-to
owner: runtime-agent
status: current
updated: 2026-05-21
freshness_triggers:
  - agents/**
  - manifests/**
  - scenarios/**
  - libs/runtime-agent/**
  - libs/runtime-manifest/**
  - apps/worker/src/shipped-agents.ts
  - apps/ingress/**
  - fixtures/**
---

# Create an agent

## Goal

Add an **application** capability agent under `agents/` that ships with the product and can be exercised locally via **HTTP webhooks** and **`npm run dev:once`**.

## Before You Start

- [Runtime manifest](../reference/runtime-manifest.md)
- [Agent reference](../reference/agents.md)
- [Agents and adapters](../explanation/agents-and-adapters.md)
- [Add a runtime event](add-a-runtime-event.md)
- Reference: `agents/agent-reviewer/` (`review-pr-agent.definition.ts`, `manifests/application.json`, `scenarios/agent-reviewer/`)

## Steps

### 1. Create the package

Under `agents/agent-<name>/`:

```text
src/<feature>-agent.definition.ts   # defineAgent
src/<feature>-agent.ts              # default export handler (defineAgentHandler)
src/definition.ts                   # export { myAgent } for shipped-agents
src/ingress.ts                      # optional webhook/test ingress helpers
src/index.ts
test/unit/
test/integration/*.e2e.test.ts
fixtures/<agent-name>/              # at repo root: fixtures/<agent-name>/
scenarios/<agent-name>/             # *.scenarios.json (repo root scenarios/)
```

Do **not** add legacy `agent.ts` with `defineRegistryAgent` or `reactor.ts` with `subscribesTo` for shipped product agents.

### 2. Implement the handler

```ts
import { defineAgentHandler } from 'runtime-agent';
import { z } from 'zod';

const myDataSchema = z.object({ /* handler-local */ }).strict();

export default defineAgentHandler(myDataSchema, async (ctx, event) => {
  // business logic; ctx.emit for outcomes
  // external IO: await ctx.adapters.invoke({ source, method, params })
});
```

Handler-local Zod for `event.data` — do not import registry schemas into handlers.

### 3. Define the agent

```ts
import { defineAgent } from 'runtime-agent';
import runMyAgent from './my-agent.js';

export const myAgent = defineAgent({
  name: 'my-agent',
  handles: ['my.signal.v1'],
  usesAdapters: ['synapse.adapters.gitlab.v1'], // optional
  run: runMyAgent,
});
```

Export from `definition.ts` and add to **`apps/worker/src/shipped-agents.ts`**.

### 4. Register event types

Add types to `libs/runtime-events` ([Add a runtime event](add-a-runtime-event.md)). Definition `handles` must use exact registry type strings.

### 5. Mount on a manifest

Edit `manifests/application.json` (or a dedicated manifest):

```json
{
  "agents": [{ "name": "my-agent" }],
  "webhooks": [{ "source": "synapse.webhooks.my-route.v1" }],
  "adapters": [{ "source": "synapse.adapters.gitlab.v1" }]
}
```

Agent entries are **name only**. Webhook route ids come from `libs/runtime-manifest/src/webhook-route-catalog.ts`; register routes in `apps/ingress`.

### 6. Add a scenario (HTTP ingress)

Create `scenarios/my-agent/my-scenario.scenarios.json`:

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/scenario/run-loop.v1.schema.json",
  "scenarios": [
    {
      "id": "my-agent/smoke",
      "manifests": ["application-default"],
      "ingress": {
        "source": "synapse.webhooks.my-route.v1",
        "fixtures": [{ "file": "fixtures/my-agent/payload.json" }]
      },
      "terminalEventTypes": ["my.outcome.v1"]
    }
  ]
}
```

Optional **`adapters[]`** on the scenario for hermetic `dev:once` (see `review-pr-gitlab-synapse.scenarios.json`). Document env in [Environment](../reference/environment.md) when agents need hermetic modes (`AGENT_REVIEWER_HERMETIC`, etc.).

### 7. Tests

- Unit tests for handler, ingress, schemas
- E2e with `agent-test-harness`:

```ts
import { eventRegistry } from 'runtime-events';
import { shippedAgentsByName } from '../../../apps/worker/src/shipped-agents.js';

const knownEventTypes = new Set(Object.keys(eventRegistry));

await withTestDevServer(
  {
    manifestPath: 'manifests/application.json',
    shippedAgents: shippedAgentsByName,
    knownEventTypes,
  },
  async (dev) => {
    const artifact = await runDevOnce({
      scenarioId: 'my-agent/smoke',
      env: dev.env,
    });
    expect(artifact.status).toBe('succeeded');
  },
);
```

Use `reactorName: 'handler'` when asserting `agent_runs`.

### 8. Documentation

Update `agents/README.md` and the agent package README.

Checklist: `.cursor/rules/new-agent.mdc`, `.cursor/rules/agent-handlers.mdc`.

## Verify

```bash
npx nx run agent-<name>:test
npm run dev
npm run dev:once -- --scenario my-agent/smoke
npx nx run runtime-manifest:test
```

## Troubleshooting

- **Unknown agent name:** Add `defineAgent` export to `shipped-agents.ts`.
- **Unknown event type:** Register in `runtime-events`; add to definition `handles`.
- **Scenario not listed:** Add your manifest `name` to scenario `manifests[]`; check scenario `id`.
- **usesAdapters not mounted:** Add source to manifest `adapters[]`.
- **Idempotency:** Handlers are at-least-once; guard side effects with dedupe keys.

## Related pages

- [Runtime manifest](../reference/runtime-manifest.md)
- [Create an example agent](create-an-example-agent.md)
- [Local agent development](local-agent-development.md)
- [Run and test agents](run-and-test-agents.md)
