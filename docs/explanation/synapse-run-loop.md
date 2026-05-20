---
title: Synapse Run Loop
kind: explanation
owner: docs
status: current
updated: 2026-05-21
freshness_triggers:
  - scripts/dev-once/**
  - libs/dev-once/**
  - scenarios/**
  - manifests/**
---

# Synapse Run Loop

## Purpose

The **Synapse Run Loop** is the canonical way to prove agent behavior locally and in tests: pick a **manifest**, start **`npm run dev`**, run one **scenario** with **`npm run dev:once`**, and inspect the **run artifact** (events, agent runs, observability links).

## Mental Model

| Piece | Role |
| --- | --- |
| Manifest | Which agents, adapters, ingress mounts, and scenario files are active |
| Scenario | Ingress source + payload files + optional adapter mocks + terminal event types |
| `npm run dev` | Starts infra, worker, webhooks (default `manifests/application.json`) |
| `npm run dev:once` | Runs one scenario against the **active** dev session |
| Run artifact | `SynapseRunArtifact` JSON — shared shape for CLI and `runDevOnce` tests |

## How It Works

```text
npm run dev -- --manifest <path>
  -> validate manifest + shipped agents + start stack

npm run dev:once -- --scenario <id>
  -> resolve manifest (default application.json; optional --manifest) + ingress
  -> load scenario (manifests[] includes active manifest name)
  -> POST ingress (+ optional adapter scenario context)
  -> wait for terminal state
  -> print artifact + tmp/dev/runs snapshot
```

Tests start a server with **`startTestDevServer`** or **`withTestDevServer`** (pass **`shippedAgents`** and **`knownEventTypes`**), then call **`runDevOnce({ scenarioId })`** — same contract as the CLI.

## Boundaries

- **`dev:once` never selects a manifest** — restart `npm run dev` to change agents or scenarios.
- **`runDevOnce` does not start workers, webhooks, or infrastructure** — lifecycle belongs to `npm run dev` or `startTestDevServer`.
- Scenarios live under `scenarios/`; static payloads under `fixtures/` or `examples/fixtures/`.
- No custom assertion DSL in scenario JSON; use Vitest on the artifact.

## Trade-Offs

- Two terminals for local proof (dev + dev:once) keeps manifest ownership clear.
- Scenarios without HTTP or poll ingress are not `dev:once` targets yet — add ingress mounts or use lower-level integration tests.

## Related Reference

- [Run once with fixtures](../how-to/run-once-with-fixtures.md)
- [Fixture files](../reference/fixtures.md)
- [Commands](../reference/commands.md)
- [Runtime manifest](../reference/runtime-manifest.md)
