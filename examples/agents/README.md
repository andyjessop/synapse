# Example agents

Reference agents for learning and regression. **Not loaded by default `npm run dev`** — load them via a manifest under `manifests/examples/`.

| Package | What it exercises |
| --- | --- |
| `example-agent-echo` | Minimal handler + HTTP ping (`manifests/examples/echo.json`) |
| `example-agent-notifier` | Webhook-shaped ingress, ticket opened → notified |
| `example-agent-pipeline` | Multi-step chains (`defineAgent` curriculum; not on default dev manifest) |
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
npm run dev:once -- --fixture example/echo
```

Same as echo-only (only `example/echo` is registered there today):

```bash
npm run dev -- --manifest manifests/examples/all.json
npm run dev:once -- --fixture example/echo
```

Use **`npx nx run example-agent-<name>:test`** for lower-level package/integration coverage when no webhook route and `agents[].fixtures` entry exist yet. Use **`withTestDevServer`** + **`runDevOnce`** once HTTP fixtures are wired.

## Manifests

| File | Agents |
| --- | --- |
| `manifests/examples/echo.json` | `example-echo` |
| `manifests/examples/all.json` | `example-echo` with `example/echo` fixture allowlist |

Authoritative manifest docs: [docs/reference/runtime-manifest.md](../../docs/reference/runtime-manifest.md).

## Tests

Example packages are full workspace members: **unit and integration tests run in the main CI suite** (`npx nx run-many -t test --all`). Integration tests use `agent-test-harness` and skip when Docker infra is unavailable.

```bash
npx nx run example-agent-echo:test
npx nx run example-agent-notifier:test
npx nx run example-agent-sqlite-counter:test
```

Static fixtures: `examples/fixtures/<package>/` (application fixtures stay under repo-root `fixtures/`).

**Handler vs ingress:** the worker runs the **default-export handler** from the manifest `handler` path; `src/ingress.ts` only emits the first signal (webhooks or tests).

Canonical topology: [docs/reference/agents.md](../../docs/reference/agents.md).
