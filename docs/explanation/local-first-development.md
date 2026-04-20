---
title: Local-first development
kind: explanation
owner: runtime
status: current
updated: 2026-05-20
freshness_triggers:
  - README.md
  - manifests/**
  - fixtures/**
  - scripts/dev-once/**
  - libs/synapse-fixtures/**
  - local/**
  - scripts/**
---

# Local-first development

## Purpose

Explain why Synapse optimizes clone-to-verified behavior on a laptop without cloud credentials.

## Mental Model

Local development treats **fixtures as first-class contracts**, not throwaway sample files. A fixture names a reproducible ingress story: which HTTP path (or test helper) fires, which static payload file is posted, which input event type is expected, and which terminal event types complete the run. The same repo-root paths feed **`npm run dev:once`**, fixture schema validation, integration tests, and adapter fixture modes—so breaking a fixture is a contract break, like changing an API.

Default ports, **runtime manifests**, and **`npm run dev:once`** exist so contributors prove the full loop (manifest → ingress → durable events → handler → outcome) before shipping. Hermetic tests run without Docker; integration with Docker validates the same contracts against real Postgres and Redis.

## How It Works

**Fixture contract stack** (repo-root-relative throughout):

```text
fixtures/<owner>/*.fixture.json or examples/fixtures/…   ingress + expect metadata
        ▲
manifests/*.json agents[].fixtures                         discovery for dev:once --list
        ▲
npm run dev:once -- --fixture <id> | runDevOnce | manifest adapterFixtures
```

- `npm run dev:infra` — local Postgres, Redis, OTel, Jaeger on non-default host ports
- `npm run dev` — loads `manifests/application.json` by default; prints manifest path at startup
- `npm run dev:example` or `npm run dev -- --manifest manifests/examples/echo.json` — example agent set + examples webhook routes
- `npm run dev:once -- --fixture <id>` — POSTs one manifest fixture (reads `.synapse/dev-session.json`)
- `SYNAPSE_FIXTURE_MODE` / adapter `fixtureFile` — deterministic LLM and external behavior without API keys
- Nx-from-root — one command style for all packages

One manifest per dev session keeps agents, subscriptions, route set, and fixture paths aligned. Fixture JSON is validated at parse time (`synapseFixtureSchema` in `libs/synapse-fixtures`).

## Boundaries

- Automated tests must not call live third-party APIs by default.
- Optional live environments are explicit opt-in, not CI defaults.

## Trade-Offs

- Docker dependency for full Docker stack versus faster unit-only loops in CI.

## Related Reference

- [Runtime manifest](../reference/runtime-manifest.md)
- [Agents](../reference/agents.md) — fixture files and static paths
- [Local agent development](../how-to/local-agent-development.md)
- [Commands](../reference/commands.md)
- Repo-root `fixtures/README.md`
