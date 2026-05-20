---
title: Run runtime processes
kind: how-to
owner: runtime
status: current
updated: 2026-05-20
freshness_triggers:
  - scripts/dev.ts
  - manifests/**
  - apps/worker/**
  - apps/ingress/**
---

# Run runtime processes

## Goal

Start the Synapse local development stack from the repo root with a single command.

## Before You Start

- Docker available for Postgres, Redis, and observability containers
- `npm install` completed at the repo root

## Steps

1. Start everything (infra + apps):

```bash
npm run dev
```

Startup prints `synapse manifest:` with the loaded JSON path (default `manifests/application.json`).

2. Optional — verify the durable runtime loop for **examples** (first terminal: **`npm run dev:example`**, second terminal):

```bash
npm run dev:once -- --scenario example/echo
```

### Partial stacks

| Command | Use when |
| --- | --- |
| `npm run dev:infra` | You only need Docker dependencies |
| `npx nx run worker:start` | You only need a worker (after infra is up); set `SYNAPSE_RUNTIME_MANIFEST` if not using default |
| `npm run dev -- --manifest <path>` | Application or example agent set from JSON |

`npm run dev` starts **ingress** (webhooks + poll supervisors) whenever it starts the **worker** (same terminal, prefixed logs). Routes and poll sources follow manifest `webhooks.routes` / `pollers.sources` (see `apps/ingress/README.md`).

## Verify

- Startup banner lists Postgres, Redis, Jaeger, the worker, ingress (`http://127.0.0.1:3102`), and manifest path.
- Worker logs show ready/degraded lifecycle without crash loops.
- With **`npm run dev:example`** running, `npm run dev:once -- --scenario example/echo` exits 0 when healthy.

## Troubleshooting

- **Docker not running:** `npm run dev` fails during infrastructure startup; start Docker Desktop and retry.
- **Scenario times out:** Check worker logs in the same terminal; ensure Docker infra is healthy (`npm run dev:infra:doctor`).
- **Port already in use:** Stop the other process or run `npm run dev:infra:down` and retry.
- **Wrong agents loaded:** Check manifest path on startup line; restart dev after editing manifest JSON.

## Related pages

- [Runtime manifest](../reference/runtime-manifest.md)
- [Commands](../reference/commands.md)
- [Local agent development](local-agent-development.md)
