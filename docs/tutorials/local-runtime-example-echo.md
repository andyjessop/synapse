---
title: Local runtime example (echo)
kind: tutorial
owner: runtime
status: current
updated: 2026-05-20
freshness_triggers:
  - README.md
  - manifests/examples/echo.json
  - examples/fixtures/example-agent-echo/**
  - examples/agents/example-agent-echo/**
  - apps/worker/**
---

# Local runtime example (echo)

## What You Will Build

You will run **`example/echo`**: local infrastructure, a worker loaded from **`manifests/examples/echo.json`**, one `example.ping.v1` ingress via **`POST /v1/examples/echo/ping`**, and printed follow-up from **`npm run dev:once`**.

**Note:** Default `npm run dev` uses **`manifests/application.json`** (application agents only, e.g. `agent-reviewer`). Example agents require a manifest under `manifests/examples/` — use **`npm run dev:example`** (shortcut) or **`npm run dev -- --manifest manifests/examples/echo.json`**.

## Prerequisites

- Node.js 22+
- Docker (for local Postgres, Redis, OpenTelemetry, Jaeger)
- Repository cloned; shell at the repo root

## Steps

1. Install dependencies:

```bash
npm install
```

2. List example webhook fixtures (optional):

```bash
npm run dev:example
# second terminal:
npm run dev:once -- --list
```

3. Run **`example/echo`**:

```bash
npm run dev:example
# second terminal:
npm run dev:once -- --fixture example/echo
```

Expected output includes status lines, durable **`root_id`**, event chain, and links when the stack is healthy. Startup should print `synapse manifest:` pointing at `manifests/examples/echo.json`.

4. Open Jaeger at `http://127.0.0.1:26686` to inspect spans across ingress, store, queue, and handler execution.

## Verify It Worked

The command exits with code `0`. Confirm rows in Postgres (host port `25432`):

```sql
select id, type, source, external_id, root_id
from events
order by created_at desc
limit 10;
```

## What You Learned

- Local infra uses non-default host ports so multiple stacks can coexist.
- **Runtime manifests** declare which agents load, which event types they handle, and which webhook route set is active.
- **`npm run dev:example`** + **`npm run dev:once -- --fixture example/echo`** exercise example agents with **HTTP ingress** through `apps/webhooks`.
- **`npx nx run example-agent-echo:test`** proves the same agent via **`withTestDevServer` + `runDevOnce`** without a second terminal.
- **`npm run dev`** (default manifest) is the long-lived stack for application agents.

## Next Steps

- [Runtime manifest](../reference/runtime-manifest.md) — full manifest reference
- [Local agent development](../how-to/local-agent-development.md)
- Example agents curriculum (`examples/agents/README.md`)
- [Run and test agents](../how-to/run-and-test-agents.md)
- [Agent reference](../reference/agents.md)
- [Commands](../reference/commands.md)

To stop infrastructure:

```bash
npm run dev:infra:down
```

To reset volumes:

```bash
npm run dev:infra:reset
```
