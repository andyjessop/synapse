---
title: Run and test agents
kind: how-to
owner: runtime-agent
status: current
updated: 2026-05-20
freshness_triggers:
  - agents/**
  - examples/agents/**
  - manifests/**
  - apps/webhooks/**
  - scripts/dev-once/**
  - libs/agent-test-harness/**
---

# Run and test agents

## Goal

Run or test any Synapse agent locally using the right manifest and command for its kind (application vs example).

## Before You Start

- Node.js 22+
- Docker for integration tests and long-lived dev (Postgres, Redis, Jaeger)
- `npm install` at the repo root
- [Runtime manifest](../reference/runtime-manifest.md) and [Agent reference](../reference/agents.md) (fixture contracts)

## Steps

1. **Long-lived stack + HTTP (preferred for webhook-shaped paths)**

Application (default manifest):

```bash
npm run dev:infra
npm run dev
# second terminal:
npm run dev:once -- --fixture review-pr/gitlab-synapse
```

Examples (echo):

```bash
npm run dev:infra
npm run dev:example
# second terminal:
npm run dev:once -- --fixture example/echo
```

Equivalent explicit manifest:

```bash
npm run dev -- --manifest manifests/examples/echo.json
npm run dev:once -- --fixture example/echo
```

2. **Package tests (CI-style, hermetic where possible)**

| Package | Command |
| --- | --- |
| `example-agent-echo` | `npx nx run example-agent-echo:test` |
| `example-agent-sqlite-counter` | `npx nx run example-agent-sqlite-counter:test` |
| `example-agent-sqlite-notebook` | `npx nx run example-agent-sqlite-notebook:test` |
| `agent-reviewer` | `npx nx run agent-reviewer:test` |
| All packages | `npx nx run-many -t test --all` |

Integration tests in `test/integration/*.e2e.test.ts` use `agent-test-harness` with `manifestPath` and the same **fixture contract** payload paths as `npm run dev:once` (repo-root `fixtures/` or `examples/fixtures/`). Tests skip when Postgres/Redis are unreachable (`describe.skipIf(!integrationInfraAvailable)`).

`libs/runtime-worker` also has Docker-backed chaos tests (e.g. `postgres-restart-persistence.integration.test.ts`) that **`describe.skipIf` Docker is unavailable**; they start their own Postgres container, assert data survives `docker stop` / `docker start`, then remove the container. Agent SQLite persistence across worker processes is covered in `agent-sqlite.integration.test.ts`.

## Verify

- **`dev:once`:** exit code `0`; while a fixture runs, **live flat lines** stream each new durable event and agent run (full `evt_…` ids). After completion, status, `event_id`, **Run artifact** (`tmp/dev/runs/<timestamp>_<event_id>.json`), and Jaeger link print (no duplicate Flow block). `--json` still includes `flow_text`; `--no-wait` may print a Flow tree if no live stream ran. See `specs/dev-run-graph-reporting.md`.
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
- **Jaeger:** `http://127.0.0.1:26686` — spans for ingress, append, outbox, relay, queue, handler.

## Troubleshooting

- **Webhook fixture CLI cannot reach webhooks:** Ensure **`npm run dev`** (or example manifest) is running; run **`npm run dev:infra:doctor`**.
- **Missing dev session:** Start `npm run dev` so `.synapse/dev-session.json` exists before `dev:once`.
- **Integration tests skipped:** Run `npm run dev:infra` and `npm run dev:infra:doctor`.
- **Fixture missing from `--list`:** Manifest `agents[].fixtures` path and fixture `id`; restart dev after manifest change.
- **Unknown event type:** Register in `libs/runtime-events`; add type to manifest `handles`.

## Related pages

- [Runtime manifest](../reference/runtime-manifest.md)
- [Local agent development](local-agent-development.md)
- [Agent reference](../reference/agents.md)
- [Local runtime example (echo)](../tutorials/local-runtime-example-echo.md)
- `libs/agent-test-harness/README.md`
