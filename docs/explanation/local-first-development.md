---
title: Local-first development
kind: explanation
owner: runtime
status: current
updated: 2026-05-21
freshness_triggers:
  - README.md
  - manifests/**
  - scenarios/**
  - fixtures/**
  - scripts/dev-once/**
  - local/**
  - scripts/**
---

# Local-first development

## Purpose

Explain why Synapse optimizes clone-to-verified behavior on a laptop without cloud credentials.

## Mental Model

Local development treats **scenarios as first-class contracts**, not throwaway sample files. A scenario names a reproducible ingress story: which webhook or poll source fires, which static payload files are used, which adapter FIFO mocks apply, and which terminal event types complete the run. The same repo-root paths feed **`npm run dev:once`**, scenario schema validation, and integration tests — so breaking a scenario is a contract break, like changing an API.

Default ports, **runtime manifests**, and **`npm run dev:once`** exist so contributors prove the full loop (manifest → ingress → durable events → handler → outcome) before shipping. Hermetic unit tests run without Docker; integration with Docker validates the same contracts against real Postgres and Redis.

## How It Works

**Scenario contract stack** (repo-root-relative throughout):

```text
fixtures/<owner>/*.json                    payload + adapter return bodies
        ▲
scenarios/<owner>/*.scenarios.json         ingress + optional adapters[]
        ▲
manifests/*.json scenarios[]               discovery for dev:once --list
        ▲
npm run dev:once -- --scenario <id>      runDevOnce({ scenarioId })
```

- `npm run dev:infra` — local Postgres, Redis, OTel, Jaeger on non-default host ports
- `npm run dev` — loads `manifests/application.json` by default; prints manifest path at startup
- `npm run dev:example` or `npm run dev -- --manifest manifests/examples/echo.json` — example agent set
- `npm run dev:once -- --scenario <id>` — runs one scenario (`--fixture` alias)
- `AGENT_REVIEWER_HERMETIC` — Pi fixture mode without OpenAI for reviewer runs
- Scenario `adapters[]` — deterministic GitLab (and similar) during `dev:once`
- Nx-from-root — one command style for all packages

One manifest per dev session keeps agents, ingress mounts, adapter sources, and scenario paths aligned. Scenario files are validated at load time (`scenarioFileSchema` in `libs/runtime-manifest`).

## Boundaries

- Automated tests must not call live third-party APIs by default.
- Optional live environments are explicit opt-in, not CI defaults.

## Trade-Offs

- Docker dependency for full stack versus faster unit-only loops in CI.

## Related Reference

- [Local agent development](../how-to/local-agent-development.md)
- [Runtime manifest](../reference/runtime-manifest.md)
- [Synapse Run Loop](synapse-run-loop.md)
