---
title: Runtime manifest
kind: explanation
owner: runtime-agent
status: current
updated: 2026-05-20
freshness_triggers:
  - manifests/**
  - libs/runtime-manifest/**
  - specs/manifest.md
---

# Runtime manifest

## Purpose

Describe how Synapse wires agents at runtime: a JSON manifest declares **which agents load** and **which event types each handles**; handler modules implement **what happens** when a run executes.

## Mental Model

A runtime manifest splits **policy** from **implementation**:

- **Manifest** (`manifests/*.json`) — `agents[].name`, `agents[].handles[]`, `agents[].handler` (repo-relative module path), optional `webhooks.routes` (stable route ids), optional `agents[].fixtures` for dev contracts.
- **Handler module** — default export (`defineAgentHandler` or equivalent) with handler-local Zod for `event.data`.
- **Worker** — validates the manifest, imports handlers, plans `agent_runs` when an event type appears in `handles`, executes with reactor name **`handler`**.

```text
manifests/application.json
  agents[].handles[]     → planning: event.type → which agents run
  agents[].handler       → import → default export (ctx, event)

agents/agent-reviewer/src/review-pr-agent.ts
  defineAgentHandler(schema, fn)  → business logic, ctx.emit outcomes
```

Subscriptions live in JSON so you can diff, review, and pass a path on the CLI (`npm run dev -- --manifest …`) without changing worker source. Behavior stays in TypeScript where it is typed, tested, and injectable.

## How It Works

At worker startup, `loadValidatedManifestRegistry` parses the manifest, checks every `handles` entry against `libs/runtime-events`, resolves handler paths under `agents/` or `examples/agents/`, and builds the registry the planning stream uses.

`npm run dev` treats one manifest as the **session contract** for that terminal session:

1. Worker loads only agents listed in the manifest.
2. Webhooks mount routes listed in `webhooks.routes` (see `libs/runtime-manifest/src/webhook-route-catalog.ts`).
3. `.synapse/dev-session.json` records manifest path, name, and `webhooks.routes` so `npm run dev:once` can list fixture ids from **`agents[].fixtures`** and POST webhook ingress for the active session.

Typical flow: start the stack with a manifest in terminal one, fire ingress with `npm run dev:once -- --fixture <id>` in terminal two.

## Boundaries

The manifest does **not**:

- Define event contracts — types, categories, and owners remain in `runtime-events`.
- Own HTTP routes or payload bodies — route ids and paths live in the catalog + `apps/webhooks`; fixtures reference `ingress.path`. The manifest selects `webhooks.routes` and lists fixture file paths on each agent.
- Configure adapters — `agents[].adapterFixtures` on the manifest lists stub paths; each agent handler bootstraps its own local clients (see `agent-reviewer` `configure-review-pr-dev-clients.ts`).
- Persist in Postgres — manifests are load-time configuration only.

Execution still follows Postgres (events, `agent_runs`) → planning → BullMQ → `executeRun`. Delivery is at-least-once; handlers must be idempotent where it matters. Adapters perform external IO; handlers decide when to call them.

## Trade-Offs

| Benefit | Cost |
| --- | --- |
| Swap agent sets via manifest path | `handles` must stay aligned with `runtime-events` |
| Clear policy vs implementation split | New event types touch registry and manifest |
| Fail-fast validation at startup | Invalid manifest prevents worker start |
| Handler-local Zod for `event.data` | Not automatically derived from registry schemas |

## Related Reference

- [Runtime manifest (reference)](../reference/runtime-manifest.md) — schemas, commands, troubleshooting
- [Agents and adapters](agents-and-adapters.md) — agents vs adapters
- [Agent reference](../reference/agents.md) — package layout and naming
