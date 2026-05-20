# Example agents

Reference agents for learning and regression. **Not loaded by default `npm run dev`** — load them via a manifest under `manifests/examples/`.

| Package | What it exercises |
| --- | --- |
| `example-agent-echo` | Minimal handler + HTTP ping (`manifests/examples/echo.json`, `scenarios/echo.scenarios.json`) |
| `example-agent-notifier` | Webhook-shaped ingress, ticket opened → notified |
| `example-agent-pipeline` | Multi-step chains (not on default dev manifest) |
| `example-agent-splitter` | Fan-out |
| `example-agent-dialogue` | Two agents on one trace |
| `example-agent-sqlite-counter` | Per-agent SQLite: two taps, same `ping_token` → `count_after` 1 then 2 |
| `example-agent-sqlite-notebook` | SQLite insert + outcome with derived fields |

## Run locally

```bash
npm run dev:infra
npm run dev:example
# or: npm run dev -- --manifest manifests/examples/echo.json

npm run dev:once -- --list
npm run dev:once -- --scenario example/echo
```

Echo-only manifest:

```bash
npm run dev -- --manifest manifests/examples/echo.json
npm run dev:once -- --scenario example/echo
```

Use **`npx nx run example-agent-<name>:test`** for package tests. Use **`withTestDevServer`** + **`runDevOnce({ scenarioId })`** with **`shippedAgents`** and **`knownEventTypes`** once HTTP scenarios are wired.

## Manifests

| File | Agents | Scenarios |
| --- | --- | --- |
| `manifests/examples/echo.json` | `example-echo` | `scenarios/echo.scenarios.json` |
| `manifests/examples/echo-poll.json` | `example-echo` | poll curriculum |

Authoritative manifest docs: [docs/reference/runtime-manifest.md](../../docs/reference/runtime-manifest.md).

## Tests

Example packages are full workspace members: **unit and integration tests run in the main CI suite** (`npx nx run-many -t test --all`). Integration tests use `agent-test-harness` and skip when Docker infra is unavailable.

```bash
npx nx run example-agent-echo:test
npx nx run example-agent-notifier:test
npx nx run example-agent-sqlite-counter:test
```

Static payloads: `examples/fixtures/<package>/`. Scenarios: `scenarios/`.

**Definitions:** each example ships **`defineAgent`** in `*-agent.definition.ts` and is listed in **`apps/worker/src/shipped-agents.ts`**. Manifests mount **`agents[].name`** only.

Canonical topology: [docs/reference/agents.md](../../docs/reference/agents.md).
