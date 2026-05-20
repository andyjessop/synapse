---
title: Runtime manifest
kind: explanation
owner: runtime-agent
status: current
updated: 2026-05-21
freshness_triggers:
  - manifests/**
  - libs/runtime-manifest/**
  - apps/worker/src/shipped-agents.ts
  - scenarios/**
---

# Runtime manifest

## Purpose

Describe how Synapse wires agents at runtime: a JSON manifest declares **which agents and adapters mount**, which ingress surfaces are active, and which **scenario files** `dev:once` may run. Agent **definitions** (handles, handler wiring, `usesAdapters`) live in TypeScript shipped with the worker.

## Mental Model

A runtime manifest splits **mount policy** from **implementation**:

- **Manifest** (`manifests/*.json`) — `agents[].name` only, optional `webhooks[]`, `pollers[]`, `adapters[]`.
- **Agent definition** (`*-agent.definition.ts`) — `defineAgent({ name, handles, usesAdapters?, run })`, exported via `definition.ts` and listed in `apps/worker/src/shipped-agents.ts`.
- **Handler module** — default export (`defineAgentHandler` or equivalent) referenced by `run` in the definition.
- **Worker** — validates mounts against shipped definitions and `runtime-events`, plans `agent_runs` when an event type appears in a definition’s `handles`, executes with reactor name **`handler`**.

```text
agents/agent-reviewer/src/review-pr-agent.definition.ts
  defineAgent({ name, handles, usesAdapters, run })

apps/worker/src/shipped-agents.ts
  shippedAgentsByName

manifests/application.json
  agents: [{ "name": "agent-reviewer" }]
  scenarios: ["scenarios/agent-reviewer/….scenarios.json"]

loadValidatedManifestRegistry
  resolve definition by name → findAgentsForEvent(handle)
```

Mount lists live in JSON so you can diff, review, and pass a path on the CLI (`npm run dev -- --manifest …`) without editing worker source. Behavior stays in TypeScript where it is typed, tested, and injectable.

## How It Works

At worker startup, `loadValidatedManifestRegistry` parses the manifest, checks every mounted agent name against `shippedAgents`, validates each definition’s `handles` against `knownEventTypes` from `eventRegistry`, and builds the registry the planning stream uses.

`npm run dev` treats one manifest as the **session contract** for that terminal session:

1. Worker loads only agents listed in the manifest (definitions from `shipped-agents.ts`).
2. Ingress mounts webhook routes and poll sources listed on the manifest.
3. `npm run dev:once` resolves the manifest from CLI (`--manifest`) or defaults to `manifests/application.json`; it does not read cached session state from disk.
4. `npm run dev:once -- --list` reads scenario ids whose `manifests[]` includes the session manifest `name`.

Typical flow: start the stack with a manifest in terminal one, fire ingress with `npm run dev:once -- --scenario <id>` in terminal two.

## Boundaries

The manifest does **not**:

- Declare event contracts — types remain in `runtime-events`.
- Import handler modules — paths are not on the manifest; `shipped-agents.ts` is the composition root.
- Configure per-scenario adapter mocks — those live on **scenario** JSON (`adapters[]`), applied by `dev:once` against `apps/adapters`.
- Persist in Postgres — manifests are load-time configuration only.

Execution still follows Postgres (events, `agent_runs`) → planning → BullMQ → `executeRun`. Delivery is at-least-once; handlers must be idempotent where it matters. Adapters perform external IO via `ctx.adapters`; handlers decide when to invoke them.

## Trade-Offs

| Benefit | Cost |
| --- | --- |
| Swap agent sets via manifest path | New handles require `runtime-events` + definition update |
| Thin manifests, rich definitions | Two places to touch when adding an agent (definition + mount) |
| Fail-fast validation at startup | Invalid manifest prevents worker start |
| Scenario-owned ingress contracts | Scenario files must stay aligned with manifest mounts |

## Related Reference

- [Runtime manifest (reference)](../reference/runtime-manifest.md) — schemas, commands, troubleshooting
- [Agents and adapters](agents-and-adapters.md) — agents vs adapters
- [Agent reference](../reference/agents.md) — package layout and naming
