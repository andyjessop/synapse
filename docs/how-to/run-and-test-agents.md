---
title: Run and test agents
kind: how-to
owner: runtime-agent
status: current
updated: 2026-05-21
freshness_triggers:
  - agents/**
  - examples/agents/**
  - manifests/**
  - scenarios/**
  - apps/ingress/**
  - scripts/dev-once/**
  - libs/agent-test-harness/**
  - apps/worker/src/shipped-agents.ts
---

# Run and test agents

## Goal

Run or test any Synapse agent locally using the right manifest and command for its kind (application vs example).

## Before You Start

- Node.js 22+
- Docker for integration tests and long-lived dev (Postgres, Redis, Jaeger)
- `npm install` at the repo root
- [Runtime manifest](../reference/runtime-manifest.md) and [Agent reference](../reference/agents.md)

## Steps

1. **Long-lived stack + HTTP (preferred for webhook-shaped paths)**

Application (default manifest):

```bash
npm run dev:infra
npm run dev
# second terminal:
npm run dev:once -- --scenario review-pr/gitlab-synapse
```

Examples (echo):

```bash
npm run dev:infra
npm run dev:example
# second terminal:
npm run dev:once -- --scenario example/echo
```

Equivalent explicit manifest:

```bash
npm run dev -- --manifest manifests/examples/echo.json
npm run dev:once -- --scenario example/echo
```

2. **Package tests (CI-style, hermetic where possible)**

| Package | Command |
| --- | --- |
| `example-agent-echo` | `npx nx run example-agent-echo:test` |
| `example-agent-sqlite-counter` | `npx nx run example-agent-sqlite-counter:test` |
| `example-agent-sqlite-notebook` | `npx nx run example-agent-sqlite-notebook:test` |
| `agent-reviewer` | `npx nx run agent-reviewer:test` |
| All packages | `npx nx run-many -t test --all` |

Integration tests in `test/integration/*.e2e.test.ts` use `agent-test-harness` with `manifestPath`, **`shippedAgents`**, **`knownEventTypes`**, and the same **scenario ids** as `npm run dev:once`. Tests skip when Postgres/Redis are unreachable (`describe.skipIf(!integrationInfraAvailable)`).

Import `shippedAgentsByName` from `apps/worker/src/shipped-agents.ts` and `knownEventTypes` from `Object.keys(eventRegistry)` — the harness does not default to application agents.

## Verify

- **`dev:once`:** exit code `0`; live flat lines stream events and agent runs; after completion, status, `event_id`, **Run artifact** (`tmp/dev/runs/<timestamp>_<event_id>.json`), and Jaeger link. See `specs/dev-run-graph-reporting.md`.
- **Postgres** (host port `25432`):

```sql
select id, type, source, external_id, root_id
from events
order by created_at desc
limit 20;

select id, input_event_id, agent_name, reactor_name, status
from agent_runs
order by created_at desc
limit 20;
```

- **`agent_runs.reactor_name`** for manifest handlers is **`handler`**.
- **Jaeger:** `http://127.0.0.1:26686`

## Troubleshooting

- **Webhook CLI cannot reach ingress:** Ensure **`npm run dev`** is running; run **`npm run dev:infra:doctor`**.
- **Stack not running:** Start `npm run dev` before `dev:once`.
- **Integration tests skipped:** Run `npm run dev:infra` and `npm run dev:infra:doctor`.
- **Scenario missing from `--list`:** Manifest `scenarios[]` path and scenario `id`; restart dev after manifest change.
- **Unknown event type:** Register in `libs/runtime-events`; add to definition `handles` in `defineAgent`.

## Related pages

- [Runtime manifest](../reference/runtime-manifest.md)
- [Local agent development](local-agent-development.md)
- [Agent reference](../reference/agents.md)
- [Local runtime example (echo)](../tutorials/local-runtime-example-echo.md)
- `libs/agent-test-harness/README.md`
