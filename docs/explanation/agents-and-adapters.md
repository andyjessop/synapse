---
title: Agents and adapters
kind: explanation
owner: runtime-agent
status: current
updated: 2026-05-20
freshness_triggers:
  - libs/runtime-agent/**
  - libs/runtime-manifest/**
  - agents/**
  - examples/agents/**
  - manifests/**
  - fixtures/**
  - scripts/dev-once/**
  - libs/synapse-fixtures/**
  - apps/worker/src/manifest-registry.ts
---

# Agents and adapters

## Purpose

Clarify who owns capability behavior versus external system I/O, and how **runtime manifests** connect agent packages to the worker.

## Mental Model

- **Agent** — bounded capability: emits and reacts to semantic events; may depend on adapters and other agents.
- **Adapter** — talks to an external system with a Zod config schema; performs IO, not business policy.
- **Manifest** — declarative wiring: which agents load, which event types each handles (`handles`), and which handler module path to import.
- **Fixture contract** — versioned, named proof of one agent journey: `*.fixture.json` (webhook ingress + optional `expect`), payload files, manifest `agents[].fixtures` paths, and the same contracts in `runDevOnce` tests. Fixtures are contracts alongside event types in `runtime-events`, not informal test data.

## How It Works

At worker startup, `loadValidatedManifestRegistry` reads JSON (default `manifests/application.json`), validates agent names and event types against `libs/runtime-events`, resolves handler paths under the repo root, and builds a runtime registry. Planning matches `event.type` to manifest `handles`; execution invokes the handler default export with `AgentContext`.

Handler modules use `defineAgentHandler` to Zod-parse `event.data` before business logic. Ingress (webhooks or tests) emits the first signal; the manifest does not contain ingress code—only subscriptions.

**Fixture contracts** tie HTTP-shaped and harness-shaped verification to the same files:

| Layer | Location | Role |
| --- | --- | --- |
| Fixture JSON | `fixtures/<agent>/*.fixture.json` or `examples/fixtures/` | `id`, webhook `ingress`, optional `expect` |
| Payload | Path in `ingress.body.file` | Authoritative JSON/Markdown bodies |
| Session | `manifests/*.json` → `agents[].fixtures` | Which fixture files are valid for `npm run dev:once -- --list` |
| Adapters | Manifest `adapterFixtures` + agent bootstrap | Hermetic Pi/GitLab responses without live APIs |

Adding an HTTP-capable agent means adding or extending these contracts, not only a handler module.

Adapters are defined with `defineAdapter` and validated by `createRuntimeRegistry` / manifest wrapping where applicable. Agents invoke adapters through typed clients configured in the agent handler (e.g. `agent-reviewer` reads `adapterFixtures` from the manifest).

See [Runtime manifest](../reference/runtime-manifest.md) and [Agent reference](../reference/agents.md).

## Application vs example agents

| | Application | Example |
| --- | --- | --- |
| Directory | `agents/agent-<name>/` | `examples/agents/example-agent-<name>/` |
| Default `npm run dev` | `manifests/application.json` | Not loaded |
| Typical manifest | `manifests/application.json` | `manifests/examples/<name>.json` |
| Webhook route set | `application` | `examples` |
| Webhook fixtures | `npm run dev:once` (after default dev) | Same CLI — start dev with example manifest first |

Example agents teach patterns and regression coverage; application agents ship product capability (today: `agent-reviewer`). **SQLite-backed examples** load when their manifest lists them; they use `SYNAPSE_AGENT_SQLITE_DIR` like production (see [Environment](../reference/environment.md)).

**`example-echo`** is the manifest agent name for `example-agent-echo`. Local HTTP path:

```bash
npm run dev:example
npm run dev:once -- --fixture example/echo
```

## Boundaries

- Adapters must not emit semantic runtime events directly.
- Agents must not bypass adapter boundaries for external mutations.
- Example agents must not appear in `manifests/application.json`.
- Do not add new `registered-*-agents.ts` files or `defineAgent` / `defineReactor` registration for shipped agents.

## Trade-Offs

- Manifest + registry validation trades startup strictness for safer refactors and a single place to see what runs locally.
- Dynamic handler import keeps worker code stable while agent packages evolve.

## Related Reference

- [Runtime manifest](../reference/runtime-manifest.md)
- [Runtime manifest (explanation)](runtime-manifest.md)
- [Runtime registry](../reference/runtime-registry.md)
- [Agent reference](../reference/agents.md)
- [Create an agent](../how-to/create-an-agent.md)
- [Create an example agent](../how-to/create-an-example-agent.md)
- [Create an adapter](../how-to/create-an-adapter.md)
