---
title: Fixture files
kind: reference
owner: docs
status: current
updated: 2026-05-20
freshness_triggers:
  - libs/synapse-fixtures/**
  - fixtures/**
  - examples/fixtures/**
  - manifests/**
---

# Fixture files

## Scope

Authoritative JSON contracts for **Synapse Run Loop** ingress and smoke expectations. Listed on manifest agents via `agents[].fixtures`.

## Contract

Validated by `synapseFixtureSchema` in `libs/synapse-fixtures`:

| Field | Required | Notes |
| --- | --- | --- |
| `version` | yes | Literal `1` |
| `id` | yes | Stable CLI id (e.g. `review-pr/gitlab-synapse`) |
| `title` | yes | Human label for `--list` |
| `agent` | yes | Must match owning manifest agent `name` |
| `ingress` | yes | Webhook POST (`kind: "webhook"`) |
| `expect` | no | Smoke metadata; not a full assertion DSL |

### Webhook ingress

```json
{
  "kind": "webhook",
  "method": "POST",
  "path": "/v1/prs",
  "headers": { "X-Gitlab-Event": "Merge Request Hook" },
  "body": { "file": "fixtures/agent-reviewer/gitlab-merge-request.json" }
}
```

## Details

- Paths in manifests and `body.file` are repo-root-relative POSIX; `..` is rejected.
- Manifest validation checks event types against `runtime-events`.
- `ingress.path` must match a route mounted via manifest `webhooks.routes`.

## Examples

- `fixtures/agent-reviewer/review-pr-gitlab-synapse.fixture.json`
- `examples/fixtures/example-agent-echo/echo.fixture.json`

## Related Pages

- [Synapse Run Loop](../explanation/synapse-run-loop.md)
- [Runtime manifest](./runtime-manifest.md)
- [Commands](./commands.md)
