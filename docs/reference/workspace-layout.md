---
title: Workspace layout
kind: reference
owner: repo
status: current
updated: 2026-05-17
freshness_triggers:
  - package.json
  - apps/**
  - libs/**
  - agents/**
  - examples/agents/**
---

# Workspace layout

## Scope

Top-level repository structure.

## Contract

Nx discovers projects from workspace `package.json` files. All npm dependencies are declared only in the root `package.json`.

## Details

| Path | Role |
| --- | --- |
| `agents/` | Application capability agents (`agent-reviewer`, …) |
| `examples/agents/` | Example/curriculum agents (`example-agent-*`) |
| `examples/fixtures/` | Static fixtures for example agents |
| `apps/` | Runnable applications (`worker`, `webhooks`) |
| `libs/` | Shared libraries (`runtime-*`, `agent-test-harness`, `pi`) |
| `fixtures/` | Shared static **fixture contracts** (`*.fixture.json`, payloads, e2e, adapters) |
| `docs/` | Canonical Diataxis documentation |
| `specs/` | Implementation specifications (not user manual) |
| `scripts/` | Dev orchestration (`dev.ts`, `dev-once.ts`), docs-check |
| `local/` | Docker Compose and local infra config |
| `test/` | Repo-level tests (e.g. docs-check) |

Prefix conventions:

- `apps/automation-*` — runnable LLM automations (when present)
- `agents/agent-*` — application agents
- `examples/agents/agent-*` — example agents
- `libs/runtime-*` — runtime foundations
- `libs/agent-test-harness` — agent e2e test harness
- `libs/shared-*` — cross-cutting shared utilities (when present)

## Examples

```text
npx nx run worker:test
```

## Related Pages

- [Package map](package-map.md)
- [Agents](agents.md)
- [Commands](commands.md)
