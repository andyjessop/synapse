---
title: Runtime manifest
kind: reference
owner: runtime-agent
status: current
updated: 2026-05-21
freshness_triggers:
  - manifests/**
  - libs/runtime-manifest/**
  - libs/runtime-agent/**
  - apps/worker/src/manifest-registry.ts
  - apps/worker/src/shipped-agents.ts
  - scripts/dev.ts
  - scripts/dev-once/**
  - libs/synapse-scenarios/**
  - scenarios/**
---

# Runtime manifest

## Scope

Authoritative reference for **JSON runtime manifests**: which agents and adapters are **mounted** in a session, which webhook routes and poll sources ingress exposes, and which **scenario files** `dev:once` may run. Agent **definitions** (handles, handler wiring, `usesAdapters`) live in code; the manifest only lists names and mounts.

Implementation package: `libs/runtime-manifest`. Background: `specs/tidying.md`, `specs/scenario-owned-ingress.md`.

## Contract

- Manifest JSON is the session **mount list** for agents, adapters, ingress surfaces, and scenario discovery paths.
- Each `agents[]` entry is **`{ "name": "<agent-name>" }` only** — no `handler`, `handles`, or `adapterFixtures` in JSON.
- Shipped agent definitions are composed in **`apps/worker/src/shipped-agents.ts`** (`defineAgent` exports from `agent-*/definition`).
- Worker validates at startup: mounted agent names must exist in `shippedAgents`; each definition’s `handles` must exist in `knownEventTypes` (from `eventRegistry`, passed by the worker).
- `npm run dev` defaults to `manifests/application.json` (`application-default`); override with `--manifest`. `npm run dev:once` uses the same default and accepts `--manifest` to match the worker.

## Details

### Mental model

| Concept | Lives in | Does not live in |
| --- | --- | --- |
| **Agent identity & subscriptions** | `defineAgent({ name, handles, usesAdapters?, run })` in `*-agent.definition.ts` | Manifest JSON |
| **Handler implementation** | Default-export function (usually `defineAgentHandler`) referenced by `run` | Manifest JSON |
| **Agent mount** | Manifest `agents[].name` | npm package name alone (related but not identical) |
| **Adapter source** | `defineAdapterSource` in `adapters/*`, listed in `apps/adapters/src/shipped-adapters.ts` | Manifest beyond `adapters[].source` mount |
| **Ingress (first signal)** | `apps/ingress` + optional `ingress.ts` in agent packages | Manifest (except `webhooks` / `pollers` mount hints) |
| **Dev proof stories** | `scenarios/**/*.scenarios.json` with `manifests[]` | Per-agent `fixtures` arrays on manifest agents |
| **Event contracts** | `libs/runtime-events` registry | Handler-local Zod only (operational shapes) |

```text
agent-reviewer/definition.ts
  defineAgent({ name, handles, usesAdapters, run: reviewPrHandler })

apps/worker/src/shipped-agents.ts
  shippedAgentsByName → passed to loadValidatedManifestRegistry

manifests/application.json
  agents: [{ "name": "agent-reviewer" }]
  adapters: [{ "source": "synapse.adapters.gitlab.v1" }]
  webhooks: [{ "source": "synapse.webhooks.prs.v1" }]

scenarios/agent-reviewer/….scenarios.json
  scenarios[].manifests: ["application-default", …]

loadValidatedManifestRegistry
  resolve definition by name → registry.findAgentsForEvent(handle)
  reactor name: "handler"
```

The worker does **not** dynamically import handler paths from the manifest. Example curriculum packages may still use legacy `defineRegistryAgent` / `defineReactor` in tests; that path is not the shipped product model.

### Manifest file format

- **Format:** JSON, extension `.json`
- **Version:** top-level `version` must be literal `1`
- **Schema:** top-level `schema` must be `libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json` (`MANIFEST_SCHEMA_PATH`)
- **Default path:** `manifests/application.json` (repo root)
- **Strict keys:** unknown top-level or agent-level keys fail validation (Zod `.strict()`)

### Top-level schema

| Field | Required | Description |
| --- | --- | --- |
| `version` | yes | Must be `1` |
| `schema` | yes | Repo-root-relative JSON Schema path for this manifest document |
| `name` | yes | Human/session id (logs, dev session) |
| `description` | no | Documentation only |
| `agents` | yes | Non-empty array of `{ "name": string }` mounts |
| `webhooks` | no | `{ "source": "<WebhookRouteId>" }[]` — routes `apps/ingress` mounts |
| `pollers` | no | Poll source mounts (`source`, optional `intervalMs`, `enabled`, `params`) |
| `adapters` | no | `{ "source": "<adapter-source-id>" }[]` — sources that must be registered in `apps/adapters` at invoke time |

### Agent entry (`agents[]`)

Each entry has **exactly** one field:

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Must match a `defineAgent({ name })` export in `apps/worker/src/shipped-agents.ts` |

**Not supported on manifest agents:** `handler`, `handles`, `module`, `emits`, `adapterFixtures`, `fixtures`, `enabled`, or any other keys.

Handles and `usesAdapters` are validated from the **shipped definition** at load time. Unknown `handles` event types fail when `knownEventTypes` does not include them.

### `webhooks` (optional)

Array of `{ "source": "<WebhookRouteId>" }`. Catalog ids: `libs/runtime-manifest/src/webhook-route-catalog.ts`. `apps/ingress` mounts only listed sources.

### `pollers` (optional)

Array of `{ "source": "<PollSourceId>", "intervalMs"?, "enabled"?, "params"? }`. Catalog: `libs/runtime-manifest/src/poll-source-catalog.ts`.

### `adapters` (optional)

Array of `{ "source": string }` where `source` matches `synapse.adapters.{family}.v{N}`. Scenario `adapters[]` entries must be mounted here when scenarios use adapter FIFO mocks.

### Scenarios (`scenarios/**/*.scenarios.json`)

Scenarios are **not** listed on the manifest. Each scenario file declares which manifests may run it via **`manifests[]`** (must include the runtime manifest **`name`**). `dev:once --list` scans `scenarios/**/*.scenarios.json` and shows scenarios whose `manifests` includes the active session manifest.

| Field | Purpose |
| --- | --- |
| `id` | CLI id for `npm run dev:once -- --scenario <id>` (alias `--fixture`) |
| `manifests` | Manifest `name` values this scenario is valid for (e.g. `application-default`) |
| `ingress.source` | Webhook route id or poll source id (must be mounted on manifest) |
| `ingress.fixtures` | One or more repo-root-relative payload files for multi-step runs |
| `terminalEventTypes` | Optional wait targets for `dev:once` |
| `adapters` | Optional ingress-only adapter mocks for `apps/adapters` scenario FIFO |

Per-agent `*.fixture.json` paths on `agents[]` are **not** supported; use scenario files instead.

### Shipped manifests

| File | `name` | Agents (mount) | Typical use |
| --- | --- | --- | --- |
| `manifests/application.json` | `application-default` | `agent-reviewer` | Default `npm run dev` |
| `manifests/examples/echo.json` | `example-echo` | `example-echo` | Echo tutorial |
| `manifests/examples/echo-poll.json` | `example-echo-poll` | `example-echo` | Poll curriculum |
| `manifests/debug/reviewer-only.json` | `debug-reviewer-only` | `agent-reviewer` | Narrow debugging |

Example `manifests/application.json`:

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json",
  "name": "application-default",
  "agents": [{ "name": "agent-reviewer" }],
  "webhooks": [{ "source": "synapse.webhooks.prs.v1" }],
  "adapters": [{ "source": "synapse.adapters.gitlab.v1" }]
}
```

Example scenario binding (`scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json`):

```json
{
  "scenarios": [
    {
      "id": "review-pr/gitlab-synapse",
      "manifests": ["application-default", "debug-reviewer-only"],
      "ingress": { "source": "synapse.webhooks.prs.v1", "fixtures": [{ "file": "fixtures/…" }] }
    }
  ]
}
```

Example `manifests/examples/echo.json`:

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json",
  "name": "example-echo",
  "agents": [{ "name": "example-echo" }],
  "webhooks": [{ "source": "synapse.webhooks.example-echo-ping.v1" }]
}
```

### Agent definition (`defineAgent`)

Shipped in each agent package (e.g. `agents/agent-reviewer/src/review-pr-agent.definition.ts`):

```ts
import { defineAgent } from 'runtime-agent';
import runReviewPrAgent from './review-pr-agent.js';

export const reviewPrAgent = defineAgent({
  name: 'agent-reviewer',
  handles: ['pr.received.v1'],
  usesAdapters: ['synapse.adapters.gitlab.v1'],
  run: runReviewPrAgent,
});
```

`apps/worker/src/shipped-agents.ts` imports `reviewPrAgent` from `agent-reviewer/definition` and builds `shippedAgentsByName`.

**Handler module** (e.g. `review-pr-agent.ts`) still default-exports `defineAgentHandler(schema, fn)` or an equivalent `AgentHandler`. Rules unchanged:

- Handler-local Zod for `event.data` (do not import registry schemas into handlers).
- External IO via **`ctx.adapters.invoke`** (not adapter `/definition` or live clients in agents).
- No MQTT, BullMQ, Redis, or HTTP frameworks in handlers.

### Run identity (`agent_runs`)

Planner reactor name is always **`handler`** (`MANIFEST_HANDLER_REACTOR_NAME`). Outcome payloads may use domain-specific reactor labels where the event registry requires them.

### Validation (fail fast at worker startup)

`loadValidatedManifestRegistry` checks:

1. JSON matches `runtimeManifestSchema` (strict keys)
2. No duplicate `agents[].name`
3. Each mounted name exists in `shippedAgents`
4. Each definition’s `handles` ⊆ `knownEventTypes`
5. Each definition’s `usesAdapters` (if any) is mounted in manifest `adapters[]`
6. Scenarios under `scenarios/` that declare this manifest in `manifests[]`: ingress sources mounted; adapter sources ⊆ manifest `adapters[]`; no duplicate scenario `id` per manifest

Failures prevent worker startup with an explicit error.

### Runtime loading

```text
apps/worker/src/main.ts
  └── loadWorkerManifestRegistry(env)
        ├── resolveManifestPath
        ├── loadValidatedManifestRegistry({ shippedAgents, knownEventTypes, … })
        └── wrapManifestRuntimeRegistry

Planning stream
  └── registry.findAgentsForEvent(event.type)
        └── ensureAgentRun(agentName, reactorName: "handler")
        └── executeRun → definition.run(ctx, event)
```

Console on worker and `npm run dev` startup:

```text
synapse manifest: /absolute/path/to/manifests/application.json
```

### Local development

| Mechanism | Example |
| --- | --- |
| Default | `manifests/application.json` when unset |
| CLI | `npm run dev -- --manifest manifests/examples/echo.json` |
| Environment | `SYNAPSE_RUNTIME_MANIFEST=manifests/examples/echo.json npm run dev` |

**Ignored when manifest is set via `npm run dev`:** `SYNAPSE_WORKER_AGENT_SET`. Webhook and poll mounts come from manifest `webhooks` / `pollers`; ingress reads `SYNAPSE_RUNTIME_MANIFEST`.

### What `npm run dev` does

1. Resolves and parses the manifest (default `manifests/application.json`)
2. Sets `SYNAPSE_RUNTIME_MANIFEST` on child processes
3. Prints `synapse manifest: …`
4. Starts Docker infra, adapters app, worker, ingress (when mounts require it)

### `npm run dev:once` (ingress only)

- Defaults to **`manifests/application.json`**; **`--manifest <path>`** overrides for list/run
- Requires **`npm run dev`** running (same manifest as worker when using `--manifest`)
- `npm run dev:once -- --list` shows scenario `id` values whose `manifests[]` includes the resolved manifest `name`
- `npm run dev:once -- --scenario <id>` (alias `--fixture`) runs against local ingress; worker must use a matching manifest

```bash
# Terminal 1
npm run dev -- --manifest manifests/examples/echo.json

# Terminal 2
npm run dev:once -- --manifest manifests/examples/echo.json --list
npm run dev:once -- --manifest manifests/examples/echo.json --scenario example/echo
```

**Shortcut:** `npm run dev:example` starts dev with `manifests/examples/echo.json`.

### Adapter dev behavior

- **Worker:** `ctx.adapters` HTTP RPC to `apps/adapters` (`ADAPTERS_BASE_URL`).
- **Scenarios:** optional `adapters[]` on scenario files install FIFO mocks on the adapters app (`POST /v1/dev/scenario-context` path) for ingress-only runs.
- **`agent-reviewer` hermetic:** set `AGENT_REVIEWER_HERMETIC=1` in env when starting dev (not in manifest). See [Environment](environment.md) and `agents/agent-reviewer/README.md`.

### Security

1. Manifest files must stay under the repo root (warn if resolved path escapes)
2. No secrets in manifest JSON
3. Handler code is only loaded from shipped definitions compiled into the worker process — not from arbitrary manifest paths

### Observability

Structured logs may include low-cardinality fields: `manifest_name`, `agent_name`, `event_type`. Do not use full manifest path as a metric label.

### Adding or changing agents

### Application agent checklist

1. Implement handler module (`defineAgentHandler` default export) and **`defineAgent`** in `*-agent.definition.ts`.
2. Export definition from `definition.ts`; add to **`apps/worker/src/shipped-agents.ts`**.
3. Add event types to `libs/runtime-events` if needed.
4. Mount `{ "name": "…" }` in `manifests/application.json` (or custom manifest).
5. Add `webhooks` / `pollers` / `adapters` mounts as needed.
6. Add `scenarios/<agent>/….scenarios.json` with `manifests[]` including your manifest `name`.
7. Add HTTP routes in `apps/ingress` when using webhooks.
8. Tests: `runAgentE2e` / `withTestDevServer` must pass **`shippedAgents`** and **`knownEventTypes`** (see `examples/agents/example-agent-echo/test/integration/echo-dev-once.e2e.test.ts` for pattern importing from `apps/worker/src/shipped-agents.ts`).

### Example agent checklist

Same pattern under `examples/agents/` with `example-agent-*` package names and `manifests/examples/*.json`. Do not add example agents to `manifests/application.json` unless intentional.

### Multiple agents, one event type

Multiple shipped definitions may list the same handle; planning invokes each matching agent (broadcast semantics).

### Testing

| Layer | How |
| --- | --- |
| Schema | `npx nx run runtime-manifest:test` |
| Worker load | `apps/worker/test/unit/manifest-registry.test.ts` |
| Agent e2e | `withTestDevServer({ manifestPath, shippedAgents, knownEventTypes, … })` |
| Architecture | `npm run test:docs` (`test/architecture/runtime-boundaries.test.ts`) |

Hermetic tests must not call live third-party APIs.

### Troubleshooting

| Symptom | What to check |
| --- | --- |
| Worker exits on startup | Manifest path, strict keys, unknown mounted agent name, handle not in `eventRegistry`, `usesAdapters` not mounted |
| `dev:once` cannot reach ingress | Start `npm run dev` first; check `127.0.0.1:3102` |
| Scenario not in `--list` | `manifests[]` includes active manifest `name`; valid `id` in scenario file |
| Webhook 404 | Manifest `webhooks` includes scenario `ingress.source`; restart dev after manifest change |
| Agent never runs | Definition `handles` includes ingress event type |
| `dev:once --manifest` fails | Expected — use `npm run dev -- --manifest` instead |
| Unknown agent in manifest | Add `defineAgent` + `shipped-agents.ts` entry |

## Examples

```bash
npm run dev
npm run dev -- --manifest manifests/examples/echo.json
SYNAPSE_RUNTIME_MANIFEST=manifests/debug/reviewer-only.json npm run dev
npm run dev:once -- --scenario review-pr/gitlab-synapse
npm run dev:once -- --scenario example/echo
```

## Related Pages

- [Agents](agents.md) — package layout, scenarios, adapters
- [Runtime manifest (explanation)](../explanation/runtime-manifest.md)
- [Agents and adapters](../explanation/agents-and-adapters.md)
- [Create an adapter](../how-to/create-an-adapter.md)
- [Local agent development](../how-to/local-agent-development.md)
- [Commands](commands.md)
- [Environment](environment.md)

Outside `docs/`: `libs/runtime-manifest/README.md`, `specs/tidying.md`, `specs/adapters.md`.
