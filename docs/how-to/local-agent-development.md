---
title: Local agent development
kind: how-to
owner: runtime-agent
status: current
updated: 2026-05-21
freshness_triggers:
  - agents/**
  - examples/agents/**
  - manifests/**
  - scenarios/**
  - apps/worker/src/manifest-registry.ts
  - apps/ingress/**
  - scripts/dev.ts
  - scripts/dev-once/**
---

# Local agent development

## Goal

Pick one workflow below. Each answers a different local question.

**[Long-lived local stack](local-agent-development.md#long-lived-local-stack)** — keep infrastructure, worker, and webhooks running while you work. Use this when you want a **stable process** you can attach to, watch logs from, and hit over HTTP where ingress exists.

**[Scenario sender](local-agent-development.md#scenario-sender)** — with the stack already up, run one manifest scenario via **`npm run dev:once`**, then read durable state from Postgres.

**Manifest reference (schemas, validation, troubleshooting):** [Runtime manifest](../reference/runtime-manifest.md). Agent naming, scenarios, and package layout: [Agent reference](../reference/agents.md).

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
| **Agents** | Manifest `agents[].name` → definitions from `apps/worker/src/shipped-agents.ts` |
| **Webhooks / polls** | Manifest `webhooks[]`, `pollers[]` |
| **Adapters app** | Manifest `adapters[]` sources registered in `apps/adapters` |
| **Reviewer Pi mode** | `AGENT_REVIEWER_HERMETIC` / `AGENT_REVIEWER_PI_MODE` env (see [Environment](../reference/environment.md)) |

The worker does **not** read per-agent handler paths from JSON. To change which agents run, edit a manifest or pass another path:

```bash
npm run dev -- --manifest manifests/examples/echo.json
SYNAPSE_RUNTIME_MANIFEST=manifests/debug/reviewer-only.json npm run dev
```

See [Runtime manifest](../reference/runtime-manifest.md) for all shipped manifests.

### Adding or changing agents

1. Implement **`defineAgent`** + handler in the agent package; add to **`shipped-agents.ts`**.
2. Mount `{ "name": "…" }` in a manifest.
3. Register event types in `libs/runtime-events` if needed.
4. For HTTP ingress: webhook route in `apps/ingress` + scenario under `scenarios/` with `manifests[]` including your manifest `name`.

**Ingress while the stack is up:** **`npm run dev:once -- --scenario <id>`** (defaults to `manifests/application.json`). Pass **`--manifest <path>`** when the stack was started with a non-default manifest. `--fixture` is an alias for `--scenario`.

**Observe:** Jaeger `http://127.0.0.1:26686`, Postgres `127.0.0.1:25432`, webhooks `http://127.0.0.1:3102`.

### Debug agent handlers (breakpoints)

Handlers run in the **worker** child of **`npm run dev`**, not in **`npm run dev:once`**.

1. Stop any existing **`npm run dev`** session (or use a free inspector port via **`SYNAPSE_DEV_DEBUG_WORKER_PORT`**).
2. VS Code launch **`dev (worker inspect)`** — or **`SYNAPSE_DEV_DEBUG_WORKER=1 npm run dev`**, then attach to port **9230**.
3. Trigger work in a second terminal: **`npm run dev:once -- --scenario review-pr/gitlab-synapse`**. **`dev:once`** only drives ingress and polls Postgres; the attached worker runs the handler.

## Scenario contracts

Each **`npm run dev:once`** run exercises a **scenario** whose `manifests[]` includes the active manifest:

1. **Scenario file** — `scenarios/**/*.scenarios.json` with stable `id`
2. **Payload file(s)** — paths in `ingress.fixtures[].file`
3. **Optional adapter mocks** — `adapters[]` on the scenario (GitLab stubs for `review-pr/gitlab-synapse`)

The same `scenarioId` is used in integration tests (`withTestDevServer` + `runDevOnce`). Treat scenario changes like API changes: update scenario JSON (`manifests[]`), payloads, tests, and agent README together.

For **`agent-reviewer`**, set **`AGENT_REVIEWER_HERMETIC=1`** before **`npm run dev`** to avoid live LLM calls; GitLab IO still goes through **`ctx.adapters`** (use scenario adapter mocks during `dev:once`).

## Scenario sender

Requires **`npm run dev`** (or `npm run dev -- --manifest …`) running in another terminal.

```bash
npm run dev:once -- --list
npm run dev:once -- --scenario review-pr/gitlab-synapse
npm run dev:once:clean
npm run dev:once:clean -- --scenario review-pr/gitlab-synapse
```

**`npm run dev:once:clean`** truncates loopback Postgres runtime tables (`events`, `agent_runs`) and drains the BullMQ reactor queue before ingress. It also clears a stale `tmp/dev/active-scenario-run.json` from an interrupted `dev:once` and best-effort deletes the old adapter scenario run. Use it when a scenario’s webhook dedupes on the same `source` + `external_id` and you need a fresh graph instead of an instant replay of a terminal run. Omit `-- --scenario` for the interactive picker.

**Manifest:** `dev:once` defaults to `manifests/application.json` (`application-default`). Pass **`--manifest`** when the stack was started with `npm run dev -- --manifest <path>`. Do not run two `dev:once` processes at once.

After starting with an example manifest:

```bash
# Terminal 1
npm run dev -- --manifest manifests/examples/echo.json

# Terminal 2
npm run dev:once -- --manifest manifests/examples/echo.json --list
npm run dev:once -- --manifest manifests/examples/echo.json --scenario example/echo
```

Restart **`npm run dev`** to change which agents the worker loads. Pass the same **`--manifest`** on **`dev:once`** so scenario discovery matches the worker.

**`npm run dev:example`** starts dev with `manifests/examples/echo.json`. Then run `npm run dev:once -- --manifest manifests/examples/echo.json --scenario example/echo`.

Scenario ids come from **`scenarios/**/*.scenarios.json`** filtered by **`manifests[]`**, not from per-agent manifest fields.

## Verify

**Long-lived local stack**

- `synapse manifest:` line matches the configuration you intend.
- Worker and webhooks logs stay healthy; `GET …/healthz` on webhooks ([Run runtime processes](run-runtime-processes.md)).

**Scenario sender**

- Exit code `0` with status, event chain, and links when the stack is healthy.
- Graph snapshot under `tmp/dev/runs/` (see `apps/ingress/README.md`).

**Durable store**

- Postgres: `events`, `agent_runs` ([Run and test agents](run-and-test-agents.md)).
- Jaeger: `http://127.0.0.1:26686`.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `dev:once` cannot reach stack | `npm run dev` running; `npm run dev:infra:doctor` |
| Scenario missing from `--list` | `manifests[]` includes active manifest `name`; scenario `id`; restart dev after manifest change |
| Webhook 404 | Manifest `webhooks[]` includes scenario `ingress.source`; restart dev |
| Agent never runs | Definition `handles` includes ingress event type; agent mounted on manifest |
| `dev:once --manifest` error | Use `npm run dev -- --manifest` instead |
| Unknown agent in manifest | Add `defineAgent` + `shipped-agents.ts` entry |

## Related Pages

- [Runtime manifest](../reference/runtime-manifest.md)
- [Agent reference](../reference/agents.md)
- [Run and test agents](run-and-test-agents.md)
- [Run runtime processes](run-runtime-processes.md)
- [Local runtime example (echo)](../tutorials/local-runtime-example-echo.md)
