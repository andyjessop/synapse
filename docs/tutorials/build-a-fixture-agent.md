---
title: Build a fixture agent
kind: tutorial
owner: runtime-agent
status: current
updated: 2026-05-21
freshness_triggers:
  - examples/agents/**
  - manifests/examples/**
  - scenarios/**
  - apps/ingress/**
  - apps/worker/src/shipped-agents.ts
---

# Build a fixture agent

## What You Will Build

You will extend the **echo example** pattern: a new example agent package with owned events, **`defineAgent`** + handler, optional ingress, a **manifest** under `manifests/examples/`, a **scenario** under `scenarios/`, and tests—without calling live external APIs.

## Prerequisites

- Completed [Local runtime example (echo)](local-runtime-example-echo.md)
- [Create an example agent](../how-to/create-an-example-agent.md)

## Steps

1. Copy `examples/agents/example-agent-echo/` to `example-agent-<slug>/`.

2. Register event types in `libs/runtime-events` if needed.

3. Add **`defineAgent`** in `*-agent.definition.ts`; wire handler with `run:`; export from `definition.ts`.

4. Add the agent to **`apps/worker/src/shipped-agents.ts`**.

5. **Wire HTTP (when applicable):** route in `apps/ingress` + payload under `examples/fixtures/` + `scenarios/example-<slug>.scenarios.json` with id `example/<slug>`; list scenario path on manifest `scenarios[]`.

6. Create `manifests/examples/<slug>.json` with `{ "name": "example-<slug>" }` only under `agents[]`.

7. Add unit tests and `test/integration/*.e2e.test.ts` with `shippedAgents`, `knownEventTypes`, and `runDevOnce({ scenarioId: 'example/<slug>' })`.

## Verify

```bash
npx nx run example-agent-<slug>:test
npm run dev -- --manifest manifests/examples/<slug>.json
npm run dev:once -- --scenario example/<slug>
```

## Verify It Worked

`npm run dev:once -- --scenario example/<slug>` exits with code `0` and prints a succeeded agent run for your example agent.

## What You Learned

- Example agents use **scenarios** + manifest `scenarios[]`, not per-agent fixture arrays on the manifest.
- Shipped definitions live in code; manifests only mount names.

## Next Steps

- [Agent reference](../reference/agents.md)
- [Fixture files](../reference/fixtures.md)
- [Create an example agent](../how-to/create-an-example-agent.md)
