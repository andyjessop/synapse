---
title: Runtime manifest
kind: reference
owner: runtime-agent
status: current
updated: 2026-05-20
freshness_triggers:
  - manifests/**
  - libs/runtime-manifest/**
  - libs/runtime-agent/**
  - apps/worker/src/manifest-registry.ts
  - scripts/dev.ts
  - scripts/dev-once/**
  - libs/synapse-fixtures/**
  - .synapse/dev-session.json
---

# Runtime manifest

## Scope

Authoritative reference for **JSON runtime manifests**: how the worker discovers agents, which event types each agent handles, how handler modules are loaded, and how local development (`npm run dev`, `npm run dev:once`) stays aligned with a single manifest per session.

Implementation package: `libs/runtime-manifest`. Product spec background: `specs/manifest.md`.

## Contract

- Manifest JSON is the **only** shipped registration path for application agents.
- Each agent entry: `name`, `handler` (repo-relative path), `handles` (event types from `runtime-events`).
- Handler modules default-export `defineAgentHandler` or an equivalent async function.
- Worker validates at startup; invalid manifests block the process.
- Planner reactor name for manifest agents is always **`handler`**.
- `npm run dev` writes `.synapse/dev-session.json`; `npm run dev:once` does not accept `--manifest`.

## Details

### Mental model

| Concept | Lives in | Does not live in |
| --- | --- | --- |
| **Agent name** | Manifest `agents[].name` | npm package name (related but not identical) |
| **Subscriptions** (`handles`) | Manifest JSON | Handler TypeScript |
| **Handler implementation** | Agent package module (`handler` path) | Manifest JSON (beyond the path string) |
| **Ingress** (first signal) | `apps/webhooks` routes + agent `ingress.ts` | Manifest (except optional `webhooks` hints for dev) |
| **Event contracts** | `libs/runtime-events` registry | Handler-local schemas (must match operationally) |

```text
manifest.json
  agents[].name          → agent_runs.agent_name
  agents[].handles[]     → planning: event.type → which agents run
  agents[].handler       → dynamic import → default export (ctx, event) => …

handler module
  defineAgentHandler(schema, fn)  → Zod-validates event.data, then business logic
  ingress.ts (optional)           → ctx.emit first signal (webhooks or tests)
```

The worker **never** reads `defineAgent` / `defineReactor` registration modules. Those patterns are removed from application agents and are not part of the shipped registration path.

### Manifest file format

- **Format:** JSON, extension `.json`
- **Version:** top-level `version` must be literal `1`
- **Schema:** top-level `schema` must be `libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json` (`MANIFEST_SCHEMA_PATH` in `runtime-manifest`)
- **Default path:** `manifests/application.json` (repo root)
- **Strict keys:** unknown top-level or agent-level keys fail validation (Zod `.strict()`)

### Top-level schema

| Field | Required | Description |
| --- | --- | --- |
| `version` | yes | Must be `1` |
| `schema` | yes | Repo-root-relative JSON Schema path for this manifest document |
| `name` | yes | Human/session id for this configuration (logs, dev session) |
| `description` | no | Documentation only; runtime ignores except optional logs |
| `agents` | yes | Non-empty array of agent entries |
| `webhooks` | no | Local dev hint: which HTTP route set `apps/webhooks` mounts |

### Agent entry (`agents[]`)

Each entry has **exactly** these fields in shipped scope:

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Runtime agent name (used in `agent_runs`, metrics, `ctx.agentName`) |
| `handler` | string | Repo-root-relative POSIX path to a `.ts` module |
| `handles` | string[] | Event types this agent plans runs for (non-empty) |
| `fixtures` | object (optional) | `{ webhook: string[], adapter: string[] }` — repo-root-relative fixture paths for `dev:once --list` and local adapter mocks |

**Not supported in shipped scope:** `module`, `emits`, `usesAdapters`, `usesAgents`, `enabled`, named export symbols, or per-agent webhook config.

### `webhooks` (optional, local dev)

| Field | Type | Description |
| --- | --- | --- |
| `routes` | string[] | Stable webhook route ids from `libs/runtime-manifest/src/webhook-route-catalog.ts` (e.g. `synapse.webhooks.prs.v1`). `apps/webhooks` mounts only these routes (Hono + OpenAPI). |

Fixture discovery uses **`agents[].fixtures`** only. Each fixture file is validated by `synapseFixtureSchema` (`libs/synapse-fixtures`). Fixture `ingress.method` + `ingress.path` must match a route listed in `webhooks.routes` (via the catalog).

### Fixture contracts (first-class)

| Fixture field | Contract meaning |
| --- | --- |
| `id` | Stable name for `npm run dev:once -- --fixture <id>` |
| `agent` | Owning manifest agent `name` |
| `ingress` | Webhook POST: `method`, `path`, optional `headers`, `body.file` or inline body |
| `expect` | Optional smoke metadata (`rootEventType`, `terminalEventTypes`) for wait/verify |

Changing a payload file, ingress path, or expected terminal types without updating the fixture JSON, manifest paths, and tests is a contract break.

### Shipped manifests

| File | `name` | Agents | `webhooks.routes` | Typical use |
| --- | --- | --- | --- | --- |
| `manifests/application.json` | `application-default` | `agent-reviewer` → `pr.received.v1` | `synapse.webhooks.prs.v1` | Default `npm run dev` |
| `manifests/examples/echo.json` | `example-echo` | `example-echo` → `example.ping.v1` | `synapse.webhooks.example-echo-ping.v1` | Echo tutorial / curriculum |
| `manifests/examples/all.json` | `examples-all-fixtures` | `example-echo` only | echo + notifier routes | Echo manifest with `agents[].fixtures` |
| `manifests/debug/reviewer-only.json` | `debug-reviewer-only` | `agent-reviewer` only | `synapse.webhooks.prs.v1` | Narrow debugging |

Example `manifests/application.json`:

```json
{
  "version": 1,
  "name": "application-default",
  "agents": [
    {
      "name": "agent-reviewer",
      "handler": "agents/agent-reviewer/src/review-pr-agent.ts",
      "handles": ["pr.received.v1"],
      "fixtures": [
        "fixtures/agent-reviewer/review-pr-gitlab-synapse.fixture.json"
      ]
    }
  ],
  "webhooks": {
    "routes": ["synapse.webhooks.prs.v1"]
  }
}
```

### Handler module contract

### Path rules (`handler`)

- Repo-root-relative POSIX path (e.g. `agents/agent-reviewer/src/review-pr-agent.ts`)
- **Allowlist prefix:** `agents/` or `examples/agents/`
- **Forbidden:** `..` segments
- Target file must exist
- **Default export** must be a **function** `(ctx, event) => Promise<void>`

Optional escape hatch (local only): `SYNAPSE_ALLOW_LOCAL_MANIFEST_IMPORTS=1` — see `libs/runtime-manifest/README.md`.

### Handler function shape

Exported from `runtime-agent`:

- `AgentContext` — `agentName`, `input`, `run`, `emit`, optional `db` / `requireDb()`
- `AgentHandler` — `(ctx: AgentContext, event: SynapseEvent) => Promise<void>`
- `defineAgentHandler(eventDataSchema, fn)` — parses `event.data` with handler-local Zod before your logic

**Preferred pattern:**

```ts
import { defineAgentHandler } from 'runtime-agent';
import { z } from 'zod';

const myEventDataSchema = z.object({ /* handler-local fields */ }).strict();

export default defineAgentHandler(myEventDataSchema, async (ctx, event) => {
  // event.data is z.infer<typeof myEventDataSchema>
});
```

**Rules:**

- Do **not** import Zod schemas from `runtime-events` into handlers (operational shapes may diverge; keep handler-local schemas).
- Do **not** put `handles` or subscription lists in the handler file.
- Do **not** default-export objects with a `run` property.
- Handlers must **not** import MQTT, BullMQ, Redis, or HTTP frameworks.

### Run identity (`agent_runs`)

Manifest agents use a fixed planner reactor name: **`handler`** (constant `MANIFEST_HANDLER_REACTOR_NAME` in `runtime-manifest`). Outcome events may still use fixed labels in payloads (e.g. `reviewer.reactor: 'review-pr'` in `pr.reviewed.v1`) where the event registry requires it.

### Validation (fail fast at worker startup)

Before BullMQ processors run, `loadValidatedManifestRegistry` checks:

1. JSON matches `runtimeManifestSchema` (strict keys)
2. No duplicate `agents[].name`
3. Every `handles` entry exists in `libs/runtime-events` `eventRegistry`
4. Handler path allowlist + file exists
5. Default export passes `isAgentHandler`
6. Each `agents[].fixtures` path exists, parses as `synapseFixtureSchema`, and fixture `ingress.path` matches a route in `webhooks.routes` when webhooks are set

Failures prevent worker startup with an explicit error.

### Runtime loading

```text
apps/worker/src/main.ts
  └── loadWorkerManifestRegistry(env)
        ├── resolveManifestPath (CLI --manifest, SYNAPSE_RUNTIME_MANIFEST, or default)
        ├── parseRuntimeManifestFile
        ├── importAgentHandlerModule (per unique handler path)
        ├── validateRuntimeManifest
        └── wrapManifestRuntimeRegistry → createRuntimeRegistry shape

Planning stream (runtime-worker)
  └── registry.findAgentsForEvent(event.type)
        └── ensureAgentRun(agentName, reactorName: "handler")
```

Console on worker and `npm run dev` startup:

```text
synapse manifest: /absolute/path/to/manifests/application.json
```

### Local development

### Choosing a manifest

| Mechanism | Example |
| --- | --- |
| Default | `manifests/application.json` when unset |
| CLI | `npm run dev -- --manifest manifests/examples/echo.json` |
| Environment | `SYNAPSE_RUNTIME_MANIFEST=manifests/examples/echo.json npm run dev` |
| Worker only | `npx nx run worker:start` reads `SYNAPSE_RUNTIME_MANIFEST` / default |

**Ignored when manifest is set via `npm run dev`:** `SYNAPSE_WORKER_AGENT_SET`. Webhook routes come from manifest `webhooks.routes`; `apps/webhooks` reads `SYNAPSE_RUNTIME_MANIFEST`.

### What `npm run dev` does

1. Resolves and parses the manifest
2. Sets `SYNAPSE_RUNTIME_MANIFEST` on child processes (webhooks loads `webhooks.routes` from that file)
3. Writes **`.synapse/dev-session.json`** at repo root
4. Prints `synapse manifest: …`
5. Starts Docker infra, worker, webhooks

**`dev-session.json` shape:**

```json
{
  "manifest_path": "/abs/path/manifests/application.json",
  "manifest_name": "application-default",
  "webhooks": {
    "routes": ["synapse.webhooks.prs.v1"]
  }
}
```

### `npm run dev:once` (ingress only)

- Does **not** accept `--manifest` or `--examples`
- Requires an existing dev session (`.synapse/dev-session.json`)
- `npm run dev:once -- --list` shows fixture `id` values from `agents[].fixtures` on the session manifest
- `npm run dev:once -- --fixture <id>` POSTs to local webhooks; worker must already run with a matching manifest

```bash
# Terminal 1
npm run dev -- --manifest manifests/examples/echo.json

# Terminal 2
npm run dev:once -- --list
npm run dev:once -- --fixture example/echo
```

Example flow: `npm run dev -- --manifest manifests/examples/echo.json` then `npm run dev:once -- --fixture example/echo`.

**Shortcut:** `npm run dev:example` prints a hint and starts dev with `manifests/examples/echo.json`.

### Application dev adapters

When `synapse.webhooks.prs.v1` is mounted, agents that need local adapter stubs declare adapter fixture paths under `agents[].fixtures.adapter` (see `manifests/application.json` for `agent-reviewer`). The handler package bootstraps clients from the active manifest; the worker does not wire agent-specific adapters.

### Security

1. Handler paths resolved only through prefix allowlist (`agents/`, `examples/agents/`)
2. Reject `..` in paths
3. Warn if manifest file path resolves outside repo root
4. No secrets in manifest files
5. Optional `SYNAPSE_ALLOW_LOCAL_MANIFEST_IMPORTS=1` for local experiments only

### Observability

Structured logs and dev run artifacts may include (low-cardinality):

```json
{
  "manifest_name": "application-default",
  "manifest_path": "/abs/path/manifests/application.json",
  "agent_name": "agent-reviewer",
  "event_type": "pr.received.v1"
}
```

Do not use manifest path as a metric label (high cardinality).

### Adding or changing agents

### Application agent checklist

1. Create handler module under `agents/agent-<name>/src/<feature>-agent.ts` (default export).
2. Add event types to `libs/runtime-events` if new signals/outcomes are needed.
3. Add or extend `manifests/application.json` (or a custom manifest you pass to `npm run dev`).
4. Add HTTP ingress under `apps/webhooks` when exercising via webhooks.
5. Add `*.fixture.json` under `fixtures/<agent-name>/` and list its path on `agents[].fixtures`.
6. Unit tests: `withTestDevServer({ manifestPath })` then `runDevOnce({ fixtureId, env })` (inject deps like `setReviewPrPiClient` before run).

### Example agent checklist

1. Handler under `examples/agents/example-agent-<name>/src/…-agent.ts`.
2. New manifest under `manifests/examples/<name>.json` (do not add example agents to `manifests/application.json` unless intentional).
3. Fixture JSON under `examples/fixtures/` listed on `agents[].fixtures`.
4. Verify with `npm run dev -- --manifest manifests/examples/<name>.json` then `npm run dev:once -- --fixture <id>`.

### Multiple agents, one event type

The same `handles` event type may map to **multiple** manifest agents (broadcast semantics). No extra manifest flag is required.

### Testing

| Layer | How |
| --- | --- |
| Schema | `npx nx run runtime-manifest:test` |
| Worker load | `apps/worker/test/unit/manifest-registry.test.ts` |
| Agent e2e | `runAgentE2e({ manifestPath: 'manifests/application.json', … })` |
| Integration | `libs/runtime-manifest/test/integration/registry.integration.test.ts` |

Hermetic tests must not call live third-party APIs.

### Troubleshooting

| Symptom | What to check |
| --- | --- |
| Worker exits on startup | Manifest path, JSON strict keys, unknown `handles` event, missing handler file, invalid default export |
| `dev:once` says missing dev-session | Start `npm run dev` first (writes `.synapse/dev-session.json`) |
| Fixture not in `--list` | Fixture path on `agents[].fixtures` and valid `id` in the JSON file |
| Webhook 404 | `webhooks.routes` in manifest includes the fixture’s `ingress.path` (restart dev after manifest change) |
| Agent never runs | `handles` includes the ingress event type; planner uses `findAgentsForEvent` |
| Wrong agent runs | You started dev with a different manifest than you think — read `synapse manifest:` line |
| `dev:once --manifest` fails | Expected — use `npm run dev -- --manifest` instead |

## Examples

```bash
npm run dev
npm run dev -- --manifest manifests/examples/echo.json
SYNAPSE_RUNTIME_MANIFEST=manifests/debug/reviewer-only.json npm run dev
npm run dev:once -- --fixture review-pr/gitlab-synapse
npm run dev:once -- --fixture example/echo
```

## Related Pages

- [Agents](agents.md) — package layout, naming, fixtures
- [Runtime manifest (explanation)](../explanation/runtime-manifest.md) — why subscriptions moved to JSON
- [Local agent development](../how-to/local-agent-development.md) — day-to-day workflows
- [Commands](commands.md) — CLI table
- [Environment](environment.md) — `SYNAPSE_RUNTIME_MANIFEST`
- [Create an application agent](../how-to/create-an-agent.md)
- [Create an example agent](../how-to/create-an-example-agent.md)

Outside `docs/`: `libs/runtime-manifest/README.md`, `specs/manifest.md`.
