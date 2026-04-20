---
title: Local agent development
kind: how-to
owner: runtime-agent
status: current
updated: 2026-05-20
freshness_triggers:
  - agents/**
  - examples/agents/**
  - manifests/**
  - apps/worker/src/manifest-registry.ts
  - apps/webhooks/**
  - scripts/dev.ts
  - scripts/dev-once/**
  - libs/synapse-fixtures/**
  - .synapse/dev-session.json
---

# Local agent development

## Goal

Pick one workflow below. Each answers a different local question.

**[Long-lived local stack](local-agent-development.md#long-lived-local-stack)** — keep infrastructure, worker, and webhooks running while you work. Use this when you want a **stable process** you can attach to, watch logs from, and hit over HTTP where ingress exists.

**[Webhook fixture sender](local-agent-development.md#webhook-fixture-sender)** — with the stack already up, POST a named fixture to **`apps/webhooks`**, then read durable state from Postgres. Use this when you want a **repeatable CLI proof** of one HTTP-shaped journey.

**Manifest reference (schemas, validation, troubleshooting):** [Runtime manifest](../reference/runtime-manifest.md). Agent naming, **fixture contracts**, and package layout: [Agent reference](../reference/agents.md).

## Before You Start

- Node.js 22+ and `npm install` at the repo root ([Commands](../reference/commands.md)).
- Docker for Postgres, Redis, and observability ([Run runtime processes](run-runtime-processes.md)).

## Steps

The two sections immediately after this one are the full procedures.

## Long-lived local stack

From the repository root:

```bash
npm run dev
```

This starts Docker infrastructure, health checks, then **worker** and **webhooks**. Startup prints:

```text
synapse manifest: /absolute/path/to/manifests/application.json
```

### What loads

| Component | Source |
| --- | --- |
| **Agents** | Manifest JSON (default `manifests/application.json`) |
| **Webhooks routes** | Manifest `webhooks.routes` (e.g. `synapse.webhooks.prs.v1`) |
| **Dev session file** | `.synapse/dev-session.json` (written on dev start) |
| **Dev adapters** | Manifest `adapterFixtures` + `AGENT_REVIEWER_*` env for `agent-reviewer` |

The worker does **not** read `registered-*-agents.ts` files. To change which agents run, edit a manifest or pass another path:

```bash
npm run dev -- --manifest manifests/examples/echo.json
SYNAPSE_RUNTIME_MANIFEST=manifests/debug/reviewer-only.json npm run dev
```

See [Runtime manifest](../reference/runtime-manifest.md) for all shipped manifests and handler rules.

### Adding or changing agents

1. Implement a **handler module** (default export) in the agent package.
2. Add `agents[]` entry to a manifest (`name`, `handler` path, `handles`).
3. Register event types in `libs/runtime-events` if needed.
4. For HTTP ingress: webhooks route + a `*.fixture.json` listed on `agents[].fixtures`.

**Ingress while the stack is up:** use **`npm run dev:once -- --fixture <id>`** only (no `--manifest` on that command). It POSTs manifest fixtures against the webhooks app that matches the **already running** dev session.

**Observe:** Jaeger `http://127.0.0.1:26686`, Postgres `127.0.0.1:25432`, webhooks `http://127.0.0.1:3102`.

## Fixture contracts

Each **`npm run dev:once -- --fixture <id>`** run exercises a **fixture contract**, not a one-off POST:

1. **Fixture JSON** — `*.fixture.json` with `id`, `ingress`, optional `expect`
2. **Payload file** — repo-root path in `ingress.body.file` (e.g. `fixtures/agent-reviewer/gitlab-merge-request.json`)
3. **Manifest discovery** — path listed on `agents[].fixtures` for the owning agent

The same paths are used in integration tests (`withTestDevServer` + `runDevOnce`) and hermetic mode (`AGENT_REVIEWER_HERMETIC=1`). Treat fixture changes like API changes: update fixture JSON, manifest `adapterFixtures`, tests, and agent README together.

## Webhook fixture sender

Requires **`npm run dev`** (or `npm run dev -- --manifest …`) in another terminal so `.synapse/dev-session.json` exists.

```bash
npm run dev:once -- --list
npm run dev:once -- --fixture review-pr/gitlab-synapse
```

After starting with an example manifest:

```bash
# Terminal 1
npm run dev -- --manifest manifests/examples/echo.json

# Terminal 2
npm run dev:once -- --list
npm run dev:once -- --fixture example/echo
```

**`npm run dev:once` does not accept `--manifest`.** If you need a different agent set, restart `npm run dev` with the right manifest.

**`npm run dev:example`** starts dev with `manifests/examples/echo.json`. Then run `npm run dev:once -- --fixture example/echo`.

Fixture files are listed on `agents[].fixtures` in the active manifest. `npm run dev:once -- --list` reads `.synapse/dev-session.json` and those paths.

## Verify

**Long-lived local stack**

- `synapse manifest:` line matches the configuration you intend.
- Worker and webhooks logs stay healthy; `GET …/healthz` on webhooks ([Run runtime processes](run-runtime-processes.md)).

**Webhook fixture sender**

- Exit code `0` with status, event chain, and links when the stack is healthy.

**Durable store**

- Postgres: `events`, `agent_runs` ([Run and test agents](run-and-test-agents.md)).
- Jaeger: `http://127.0.0.1:26686`.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `dev:once` cannot reach stack | `npm run dev` running; `npm run dev:infra:doctor` |
| Missing `.synapse/dev-session.json` | Start `npm run dev` first |
| Fixture missing from `--list` | Manifest `agents[].fixtures` path and fixture `id`; [Runtime manifest](../reference/runtime-manifest.md) |
| Webhook 404 | Manifest `webhooks.routes` includes the fixture path; restart dev after manifest change |
| Agent never runs | `handles` includes ingress event type; worker manifest line |
| `dev:once --manifest` error | Use `npm run dev -- --manifest` instead |

## Related Pages

- [Runtime manifest](../reference/runtime-manifest.md)
- [Agent reference](../reference/agents.md)
- [Run and test agents](run-and-test-agents.md)
- [Run runtime processes](run-runtime-processes.md)
- [Local runtime example (echo)](../tutorials/local-runtime-example-echo.md)
- [Create an application agent](create-an-agent.md)
- [Create an example agent](create-an-example-agent.md)
