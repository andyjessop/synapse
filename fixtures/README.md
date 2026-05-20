# Fixtures

Shared static assets for the monorepo. Paths are repo-root-relative.

## Three roles (do not confuse them)

| Role | Pattern | Listed by `dev:once --list`? | Example |
| --- | --- | --- | --- |
| **Scenario** | `scenarios/**/*.scenarios.json` with `manifests[]` | **Yes** (scenario `id`) | `scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json` |
| **Ingress payload** | `*.json` in `ingress.fixtures[].file` | No | `fixtures/agent-reviewer/gitlab-merge-request.json` |
| **Adapter return stub** | JSON referenced by scenario `adapters[].returns.file` | No | `fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse-result.json` |

A **scenario** is the Synapse Run Loop contract: `id`, `manifests[]`, `ingress.source`, `ingress.fixtures`, optional `adapters[]`, optional `terminalEventTypes`. `npm run dev:once` drives ingress from the scenario; the **worker** runs handlers from **`defineAgent`** definitions.

Payload and adapter stub files are not separate CLI targets—they support the scenario.

## Manifest binding

Each scenario declares which runtime manifests may run it:

```json
"manifests": ["application-default"]
```

Use the manifest **`name`** field (e.g. `application-default` in `manifests/application.json`), not the file path.

Scenario schema: `libs/runtime-manifest/schemas/scenario/run-loop.v1.schema.json`.

## Discovery

`dev:once --list` scans `scenarios/**/*.scenarios.json` and prints each scenario whose `manifests[]` includes the active dev session manifest `name`.

## Layout

| Path | Owner | Purpose |
| --- | --- | --- |
| `fixtures/agent-reviewer/` | `agent-reviewer` | Webhook payloads, `adapters/*.json` return stubs |
| `fixtures/<agent-name>/` | other `agent-*` | Payloads and adapter stubs |
| `examples/fixtures/` | `example-agent-*` | Example payloads |
| `scenarios/` | run-loop | Scenario files (declare `manifests[]`) |
| `fixtures/docs/` | docs-check | Synthetic docs trees |
| `fixtures/runtime-llm/` | `runtime-llm` | LLM fixture responses |
