---
title: Fixture files
kind: reference
owner: docs
status: current
updated: 2026-05-21
freshness_triggers:
  - scenarios/**
  - fixtures/**
  - examples/fixtures/**
  - manifests/**
  - libs/runtime-manifest/src/scenario-schema.ts
---

# Fixture files

## Scope

Authoritative layout for **run-loop scenarios**, **ingress payload files**, and **adapter return stubs** used by `npm run dev:once`, integration tests, and hermetic local runs.

## Contract

- **Scenario discovery** — manifest `scenarios[]` points at `*.scenarios.json` files (`scenarioFileSchema` in `libs/runtime-manifest`).
- **CLI id** — each scenario’s `id` (e.g. `review-pr/gitlab-synapse`, `example/echo`) is what `npm run dev:once -- --list` prints.
- **Payload files** — repo-root-relative paths in `ingress.fixtures[].file` (JSON/Markdown bodies under `fixtures/` or `examples/fixtures/`).
- **Adapter stubs** — optional `adapters[]` on a scenario; `returns.file` points at JSON under `fixtures/.../adapters/` (validated when scenarios load).

There is no separate `*.fixture.json` run-loop format on current manifests.

## Scenario file format

| Field | Required | Notes |
| --- | --- | --- |
| `version` | yes | Literal `1` |
| `schema` | yes | `libs/runtime-manifest/schemas/scenario/run-loop.v1.schema.json` |
| `scenarios` | yes | Non-empty array |

Each scenario:

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Stable CLI id |
| `title` | no | Human label for `--list` |
| `description` | no | Documentation |
| `ingress.source` | yes | Webhook route id or poll source id (must be mounted on manifest) |
| `ingress.fixtures` | yes | One or more `{ "file": "…" }` or inline `{ "data": … }` |
| `adapters` | no | FIFO mocks for `apps/adapters` during `dev:once` |
| `terminalEventTypes` | no | Wait targets for `dev:once` |

### Webhook example

```json
{
  "id": "review-pr/gitlab-synapse",
  "ingress": {
    "source": "synapse.webhooks.prs.v1",
    "fixtures": [
      { "file": "fixtures/agent-reviewer/gitlab-merge-request.json" }
    ]
  },
  "adapters": [
    {
      "source": "synapse.adapters.gitlab.v1",
      "method": "fetchChanges",
      "params": { "projectId": 202, "mergeRequestIid": 42 },
      "returns": {
        "file": "fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse-result.json"
      }
    }
  ],
  "terminalEventTypes": ["pr.reviewed.v1"]
}
```

### Poll example

Poll scenarios use a poll catalog `ingress.source` and fixture files shaped for inject/tick (see `scenarios/echo-poll.scenarios.json` and `examples/fixtures/example-agent-echo/`). The manifest must list the poll source under `pollers[]`.

## Details

- Paths are repo-root-relative POSIX; `..` is rejected.
- Manifest validation ensures scenario ingress sources are mounted and scenario adapter sources ⊆ manifest `adapters[]`.
- `dev:once` targets loopback ingress (`INGRESS_HOST` / `INGRESS_PORT`, or `WEBHOOKS_*` aliases).

## Static asset layout

| Path | Owner | Purpose |
| --- | --- | --- |
| `fixtures/agent-reviewer/` | `agent-reviewer` | Webhook payloads, adapter return JSON |
| `fixtures/<agent-name>/` | application agents | Payloads and adapter stubs |
| `examples/fixtures/` | `example-agent-*` | Example payloads |
| `scenarios/` | run-loop | `*.scenarios.json` referenced by manifests |

## Examples

- `scenarios/echo.scenarios.json`
- `scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json`
- `fixtures/agent-reviewer/gitlab-merge-request.json`

## Related Pages

- [Synapse Run Loop](../explanation/synapse-run-loop.md)
- [Runtime manifest](./runtime-manifest.md)
- [Commands](./commands.md)
- Repo-root `fixtures/README.md`
