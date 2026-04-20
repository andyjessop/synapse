---
title: Synapse Run Loop
kind: explanation
owner: docs
status: current
updated: 2026-05-20
freshness_triggers:
  - scripts/dev-once/**
  - libs/dev-once/**
  - libs/synapse-fixtures/**
  - manifests/**
---

# Synapse Run Loop

## Purpose

The **Synapse Run Loop** is the canonical way to prove agent behavior locally and in tests: pick a **manifest**, start **`npm run dev`**, run one **fixture** with **`npm run dev:once`**, and inspect the **run artifact** (events, agent runs, observability links).

## Mental Model

| Piece | Role |
| --- | --- |
| Manifest | Which agents load and which fixture files they own |
| Fixture | Ingress contract + optional smoke `expect` metadata |
| `npm run dev` | Starts infra, worker, webhooks; writes `.synapse/dev-session.json` |
| `npm run dev:once` | Sends one fixture into the **active** dev session |
| Run artifact | `SynapseRunArtifact` JSON — shared shape for CLI and `runDevOnce` tests |

## How It Works

```text
npm run dev -- --manifest <path>
  -> validate manifest + start stack + dev-session.json

npm run dev:once -- --fixture <id>
  -> read dev-session (no --manifest on dev:once)
  -> resolve fixture from agents[].fixtures
  -> webhook POST to the running server
  -> wait for terminal state
  -> print artifact + tmp/dev/runs snapshot
```

Tests start a server with **`startTestDevServer`** or **`withTestDevServer`**, then call **`runDevOnce`** with the returned `env` — same ingress contract as `npm run dev:once`.

## Boundaries

- **`dev:once` never selects a manifest** — restart `npm run dev` to change agents.
- **`runDevOnce` does not start workers, webhooks, or infrastructure** — lifecycle belongs to `npm run dev` or `startTestDevServer`.
- Fixtures are JSON under `fixtures/` or `examples/fixtures/`, listed in manifests.
- No custom assertion DSL; use normal Vitest checks on the artifact.

## Trade-Offs

- Two terminals for local proof (dev + dev:once) keeps manifest ownership clear.
- Scenarios without HTTP ingress are not `dev:once` fixtures yet — add a webhook route or use lower-level integration tests.

## Related Reference

- [Run once with fixtures](../how-to/run-once-with-fixtures.md)
- [Fixtures](../reference/fixtures.md)
- [Commands](../reference/commands.md)
- [Runtime manifest](../reference/runtime-manifest.md)
