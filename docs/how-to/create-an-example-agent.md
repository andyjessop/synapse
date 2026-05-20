---
title: Create an example agent
kind: how-to
owner: runtime-agent
status: current
updated: 2026-05-21
freshness_triggers:
  - examples/agents/**
  - manifests/**
  - scenarios/**
  - libs/runtime-agent/**
  - apps/ingress/**
  - examples/fixtures/**
  - apps/worker/src/shipped-agents.ts
---

# Create an example agent

## Goal

Add a **curriculum / regression** agent under `examples/agents/` that is **not** loaded by default `npm run dev`, but can run locally via a **dedicated manifest** and scenario.

## Before You Start

- [Runtime manifest](../reference/runtime-manifest.md)
- [Create an application agent](create-an-agent.md) — same definition + handler pattern
- [Local runtime example (echo)](../tutorials/local-runtime-example-echo.md)
- Reference: `examples/agents/example-agent-echo/`, `manifests/examples/echo.json`, `scenarios/echo.scenarios.json`

## Steps

1. Copy layout from `examples/agents/example-agent-echo/` (`*-agent.definition.ts`, handler, `definition.ts`).

2. Package name: `example-agent-<name>`.

3. Implement **default-export handler** with `defineAgentHandler`.

4. Add **`defineAgent`** in `*-agent.definition.ts` and export via `definition.ts`.

5. Add the definition to **`apps/worker/src/shipped-agents.ts`** (example agents ship in the same worker binary).

6. Register event types in `libs/runtime-events` if new.

7. Create **`manifests/examples/<name>.json`**:

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json",
  "name": "example-<slug>",
  "agents": [{ "name": "example-<slug>" }],
  "webhooks": [{ "source": "synapse.webhooks.example-echo-ping.v1" }],
  "scenarios": ["scenarios/example-<slug>.scenarios.json"]
}
```

8. Add static payload under `examples/fixtures/example-agent-<name>/`.

9. Add **`scenarios/example-<slug>.scenarios.json`** with `id` `example/<slug>` and `ingress.fixtures[].file` pointing at the payload.

10. Add HTTP route in `apps/ingress` when ingress is HTTP-shaped.

11. Unit tests + `test/integration/*.e2e.test.ts` with `withTestDevServer({ shippedAgents, knownEventTypes, … })` + `runDevOnce({ scenarioId: 'example/<slug>' })`.

12. Document in `examples/agents/README.md` curriculum table.

13. **Do not** add example agents to `manifests/application.json`.

## Verify

```bash
npx nx run example-agent-<name>:test
npm run dev -- --manifest manifests/examples/<name>.json
npm run dev:once -- --scenario example/<slug>
```

For SQLite examples, pass `agentSqlite: { baseDir }` into `runAgentE2e` (see existing sqlite example packages).

## Troubleshooting

- **Wrong stack:** Example manifest must list the correct webhook `source` ids under `webhooks[]`.
- **Scenario not listed:** Path on manifest `scenarios[]` and matching `id` in the scenario file.
- **`dev:once --manifest`:** Not supported — restart dev with `--manifest`.

## Related pages

- [Runtime manifest](../reference/runtime-manifest.md)
- [Agent reference](../reference/agents.md)
- [Build a fixture agent](../tutorials/build-a-fixture-agent.md)
