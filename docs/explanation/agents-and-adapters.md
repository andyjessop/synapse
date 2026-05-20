---
title: Agents and adapters
kind: explanation
owner: runtime-agent
status: current
updated: 2026-05-21
freshness_triggers:
  - libs/runtime-agent/**
  - libs/runtime-adapters/**
  - libs/runtime-manifest/**
  - agents/**
  - adapters/**
  - apps/adapters/**
  - apps/worker/src/shipped-agents.ts
  - manifests/**
  - scenarios/**
  - scripts/dev-once/**
---

# Agents and adapters

## Purpose

Clarify who owns capability behavior versus external system I/O, and how **runtime manifests**, **shipped definitions**, and **scenarios** connect agent packages to the worker.

## Mental Model

- **Agent** — bounded capability: emits and reacts to semantic events; invokes adapters through **`ctx.adapters`** when external IO is needed.
- **Adapter source** — vendor boundary: `defineAdapterSource` in `adapters/*`, composed in `apps/adapters/src/shipped-adapters.ts`, invoked via HTTP RPC from the worker.
- **Manifest** — mount list: agent names, webhook/poll sources, adapter source ids, scenario file paths.
- **Agent definition** — `defineAgent({ name, handles, usesAdapters?, run })` in the agent package; listed in `apps/worker/src/shipped-agents.ts`.
- **Scenario** — versioned proof of one journey: ingress source + payload files + optional adapter FIFO mocks; declares `manifests[]` for discovery.

## How It Works

At worker startup, `loadValidatedManifestRegistry` reads JSON (default `manifests/application.json`), validates mounted agent names against `shippedAgents`, validates each definition’s `handles` against `knownEventTypes`, checks `usesAdapters` against manifest `adapters[]`, and builds the runtime registry. Planning matches `event.type` to definition `handles`; execution calls `definition.run(ctx, event)` with reactor name **`handler`**.

Handler modules use `defineAgentHandler` to Zod-parse `event.data` before business logic. Ingress (webhooks or tests) emits the first signal; the manifest only mounts routes and lists scenario files.

**Scenario contracts** tie CLI and tests to the same ingress story:

| Layer | Location | Role |
| --- | --- | --- |
| Scenario file | `scenarios/**/*.scenarios.json` | `id`, `ingress`, optional `adapters[]`, `terminalEventTypes` |
| Payload | `ingress.fixtures[].file` | Authoritative JSON/Markdown bodies under `fixtures/` or `examples/fixtures/` |
| Session | `manifests/*.json` `name` + scenario `manifests[]` | Which scenario ids appear in `dev:once --list` |
| Adapter mocks | Scenario `adapters[]` | Hermetic GitLab (and similar) responses during `dev:once` without live APIs |

Adapters are defined with **`defineAdapterSource`** in `adapters/adapter-*` and registered in **`shipped-adapters.ts`**. Agents call **`ctx.adapters.invoke`** with typed contracts from `adapter-*/` default exports — not live clients or `/definition` imports in handler code.

See [Runtime manifest](../reference/runtime-manifest.md), [Create an adapter](../how-to/create-an-adapter.md), and [Agent reference](../reference/agents.md).

## Application vs example agents

| | Application | Example |
| --- | --- | --- |
| Directory | `agents/agent-<name>/` | `examples/agents/example-agent-<name>/` |
| Default `npm run dev` | `manifests/application.json` | Not loaded |
| Typical manifest | `manifests/application.json` | `manifests/examples/<name>.json` |
| Scenarios | `npm run dev:once` after default dev | Same — start dev with example manifest first |

Example agents teach patterns and regression coverage; application agents ship product capability (today: `agent-reviewer`). **SQLite-backed examples** load when their manifest lists them; they use `SYNAPSE_AGENT_SQLITE_DIR` like production (see [Environment](../reference/environment.md)).

**`example-echo`** is the manifest agent name for `example-agent-echo`. Local HTTP path:

```bash
npm run dev:example
npm run dev:once -- --scenario example/echo
```

## Boundaries

- Adapters must not emit semantic runtime events directly.
- Agents must not import `adapter-*/definition` or perform vendor HTTP/SDK calls outside `ctx.adapters`.
- Example agents must not appear in `manifests/application.json` unless intentional.
- Do not add handler paths or `handles` to manifest JSON — use `defineAgent` + `shipped-agents.ts`.

## Trade-Offs

- Shipped definitions + manifest validation trades startup strictness for safer refactors and a single composition root per app.
- Scenario-owned ingress keeps `dev:once` aligned with manifest mounts without duplicating route metadata on agents.

## Related Reference

- [Runtime manifest](../reference/runtime-manifest.md)
- [Runtime manifest (explanation)](runtime-manifest.md)
- [Runtime registry](../reference/runtime-registry.md)
- [Agent reference](../reference/agents.md)
- [Create an agent](../how-to/create-an-agent.md)
- [Create an example agent](../how-to/create-an-example-agent.md)
- [Create an adapter](../how-to/create-an-adapter.md)
