# Fixtures

Shared static assets for the monorepo. Paths are repo-root-relative.

## Three roles (do not confuse them)

| Role | Pattern | Listed by `dev:once --list`? | Example |
| --- | --- | --- | --- |
| **Run-loop fixture** | `*.fixture.json` with `schema` → JSON Schema under `libs/runtime-manifest/schemas/webhook/` | **Yes** (under `fixtures.webhook`) | `review-pr-gitlab-synapse.fixture.json` |
| **Webhook payload** | `*.json` referenced by `ingress.body.file` | No | `gitlab-merge-request.json` |
| **Adapter fixture** | `*.json` with adapter fixture schema ids | No (listed on `fixtures.adapter`) | `adapters/gitlab-fetch-changes-synapse.json` |

A **run-loop fixture** is the Synapse Run Loop contract: `id`, webhook `ingress`, optional `expect`. `npm run dev:once` POSTs that ingress; the **worker** (with **live Pi SDK** by default under `npm run dev`) runs the full review harness and emits `pr.reviewed.v1`.

Payload and adapter files are not separate `dev:once` targets—they support the fixture or hermetic adapter mode.

## Manifest listing

On each agent row:

```json
"fixtures": {
  "webhook": ["fixtures/agent-reviewer/review-pr-gitlab-synapse.fixture.json"],
  "adapter": ["fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json"]
}
```

Schema paths are defined in `libs/runtime-manifest` (`WEBHOOK_FIXTURE_SCHEMA_PATHS`, `ADAPTER_FIXTURE_SCHEMA_PATHS`); each path points at a `.schema.json` file under `libs/runtime-manifest/schemas/`.

## Discovery

For each manifest agent, `dev:once --list` includes every `*.fixture.json` under:

- `fixtures/agent-reviewer/` for `agent-reviewer`
- `fixtures/<agent-name>/` for other `agent-*` names
- `examples/fixtures/example-agent-<name>/` for `example-*` agents

Manifest `fixtures.webhook` may list paths explicitly; discovery still picks up any sibling `*.fixture.json` in that directory.

## Layout

| Path | Owner | Purpose |
| --- | --- | --- |
| `fixtures/agent-reviewer/` | `agent-reviewer` | Run-loop fixture, webhook payload, `adapters/*.json` stub rules |
| `examples/fixtures/` | `example-agent-*` | Example run-loop fixtures |
| `fixtures/docs/` | docs-check | Synthetic docs trees |
| `fixtures/runtime-llm/` | `runtime-llm` | LLM fixture responses |

Docs: [Fixture files](../docs/reference/fixtures.md), [Synapse Run Loop](../docs/explanation/synapse-run-loop.md).
