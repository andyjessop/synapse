---
title: Create an agent
kind: how-to
owner: runtime-agent
status: current
updated: 2026-05-20
freshness_triggers:
  - agents/**
  - manifests/**
  - libs/runtime-agent/**
  - libs/runtime-manifest/**
  - apps/worker/src/manifest-registry.ts
  - apps/webhooks/**
  - fixtures/**/*.fixture.json
  - libs/synapse-fixtures/**
---

# Create an agent

## Goal

Add an **application** capability agent under `agents/` that ships with the product and can be exercised locally via **HTTP webhooks** and **`npm run dev:once`**.

## Before You Start

- [Runtime manifest](../reference/runtime-manifest.md) — registration model
- [Agent reference](../reference/agents.md) — naming and layout
- [Agents and adapters](../explanation/agents-and-adapters.md)
- [Add a runtime event](add-a-runtime-event.md)
- Reference: `agents/agent-reviewer/` (`src/review-pr-agent.ts`, `manifests/application.json`)

## Steps

### 1. Create the package

Under `agents/agent-<name>/`:

```text
src/<feature>-agent.ts   # default export handler (defineAgentHandler)
src/ingress.ts           # optional webhook/test ingress helpers
src/index.ts
test/unit/
test/integration/*.e2e.test.ts
fixtures/<agent-name>/   # at repo root: fixtures/<agent-name>/
```

Do **not** add `agent.ts` with `defineAgent` or `reactor.ts` with `subscribesTo`.

### 2. Implement the handler

```ts
import { defineAgentHandler } from 'runtime-agent';
import { z } from 'zod';

const myDataSchema = z.object({ /* handler-local */ }).strict();

export default defineAgentHandler(myDataSchema, async (ctx, event) => {
  // business logic; ctx.emit for outcomes
});
```

Inject dev dependencies (Pi, GitLab, etc.) via module-level setters or env — wire calls from `apps/worker/src/manifest-registry.ts` if the worker must configure clients at startup (see `setReviewPrPiClient`).

### 3. Register event types

Add types to `libs/runtime-events` ([Add a runtime event](add-a-runtime-event.md)). Manifest `handles` must use exact registry type strings.

### 4. Add a manifest entry

Edit `manifests/application.json` (or add a dedicated manifest you pass to `npm run dev`):

```json
{
  "name": "my-agent",
  "handler": "agents/agent-<name>/src/<feature>-agent.ts",
  "handles": ["my.signal.v1"]
}
```

Validation runs at worker startup — unknown event types or bad handler paths fail fast.

### 5. Dev adapters (if needed)

Declare `adapterFixtures` (or agent-local bootstrap) on the manifest agent row and in the handler package. Document env in [Environment](../reference/environment.md).

### 6. HTTP ingress and fixture contract (when applicable)

Treat fixtures as **first-class contracts** (payload + `*.fixture.json` + manifest `agents[].fixtures` + tests):

1. Static payload under `fixtures/<agent-name>/`
2. Zod-validated route in `apps/webhooks/`
3. `*.fixture.json` validated by `synapseFixtureSchema` (`id`, webhook `ingress`, optional `expect`)
4. Fixture path on manifest `agents[].fixtures`
5. E2e loads the same `fixture.file` path via `runAgentE2e`
6. Document in `apps/webhooks/README.md` and `fixtures/README.md`

### 7. Tests

- Unit tests for handler, ingress, schemas
- E2e with `agent-test-harness`:

```ts
await runAgentE2e({
  manifestPath: 'manifests/application.json',
  run: async ({ pool, repoRoot }) => {
    // configure clients, emit ingress, assert runs / events
  },
});
```

Use `reactorName: 'handler'` when asserting `agent_runs` (manifest planner name).

### 8. Documentation

Update `agents/README.md` and any agent package README.

Checklist: `.cursor/rules/new-agent.mdc`, `.cursor/rules/agent-handlers.mdc`.

## Verify

```bash
npx nx run agent-<name>:test
npm run dev:infra
npm run dev
npm run dev:once -- --fixture <fixture-id>
npx nx run runtime-manifest:test   # when touching manifest rules
```

## Troubleshooting

- **Unknown event type in manifest:** Register in `runtime-events` first.
- **Handler not a function:** Default export must be `defineAgentHandler` or async function with Zod parse.
- **Fixture not listed:** Add fixture JSON and list its path on `agents[].fixtures`.
- **Idempotency:** Handlers are at-least-once; guard side effects with dedupe keys.

## Related pages

- [Runtime manifest](../reference/runtime-manifest.md)
- [Create an example agent](create-an-example-agent.md)
- [Local agent development](local-agent-development.md)
- [Run and test agents](run-and-test-agents.md)
