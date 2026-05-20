# Scenario-owned ingress fixtures and adapter calls

## Related spec

Broader scenario runner architecture, observability, and the original freeze gate live in [scenarios.md](./scenarios.md). This document is the focused contract for scenario-owned ingress fixtures, adapter mocks, and repo layout.

## Spec status

**Architecture: approved. Implementation-frozen (v1).** Contracts below are frozen for shipped v1 scope. Poll ingress mechanics (`runPollSource`, catalogs, registrars) remain defined in [polling.md](./polling.md); this spec owns the **dev proof contract** for `dev:once`.

Do not start implementation until the [Freeze gate](#freeze-gate) checklist passes in code review against this document.

---

## Goal

Simplify dev scenarios so the **runtime manifest** only declares what is loaded, while **scenario files** declare what happens during a single `npm run dev:once` run.

When it works, a contributor can:

1. Start dev with a manifest: `npm run dev -- --manifest <path>`
2. List proof stories for that session: `npm run dev:once -- --list`
3. Run one story: `npm run dev:once -- --scenario <id>` (or `--fixture <id>` as a compatibility alias)
4. Inspect `tmp/dev/runs/<timestamp>_<input_event_id>.json` for the event graph and agent runs

| Layer | Technology | Purpose |
| --- | --- | --- |
| Runtime manifest | `libs/runtime-manifest` | Agents, mounted webhook routes, mounted poll sources, scenario file paths |
| Scenario files | `libs/synapse-scenarios` | Named `dev:once` stories (`ingress`, fixtures, adapter mocks) |
| Fixture bytes | Repo `fixtures/` | Ingress bodies and adapter return payloads only |
| Ingress app | `apps/ingress` | Webhook POST, poll tick, scenario-scoped adapter stubs |
| Scenario runner | `libs/dev-once` | Resolve scenario, trigger ingress, wait, build artifact |
| Run artifact | `libs/dev-once` + `libs/dev-cli-shared` | `SynapseRunArtifact` (public); on-disk `DevOnceRunRecord` under `tmp/dev/runs/` |

**Core rule (v1):**

```text
Manifest  = runtime surfaces and agents loaded into the dev session.
Scenario  = one explicit dev:once story (ingress source, ingress fixtures, adapter mocks).
Fixture   = bytes/data referenced by scenarios ({ file } or { data }).
```

**Architecture slogan:** *Manifest loads capability; scenarios prove behavior; fixtures are data only.*

**Non-negotiables**

- **No manifest adapter fixtures:** `agents[].adapterFixtures` is not supported. Adapter mocks live on scenarios only.
- **Ingress type is inferred:** `ingress.source` resolves against webhook or poll catalogs and manifest mounts. No `kind`, `mode`, `trigger`, or `adapterFixtures` fields.
- **One poll execution path for scenarios:** `POST /v1/poll/{sourceId}/tick` through `runPollSource()` → registrar → agent ingress → `ctx.emit`. `dev:once` does not use poll `/inject`.
- **Root identity from ingress:** `dev:once` anchors graphs on **root event ids returned by ingress**, never “latest event by type.”
- **Local-first:** scenarios run against loopback ingress only. When scenario context is active, fixture-aware adapter clients must not call live third-party APIs.
- **Repo layout:** all manifests under `manifests/`, all scenario files under `scenarios/`, all fixture payload files under `fixtures/` (see [Repository layout](#repository-layout-authoritative)).

---

## Core model

| Concept | Owns | Does not own |
| --- | --- | --- |
| **Runtime manifest** | Agent handlers, `handles`, mounted `webhooks[]`, mounted `pollers[]`, `scenarios[]` file paths (discovery only) | Fixture bytes, adapter stub matching, which story to run |
| **Scenario file** | Scenario ids, `ingress.source`, `ingress.fixtures[]`, scenario-level `adapters[]`, `terminalEventTypes[]` | Runtime scheduling, worker registration, catalog definitions |
| **Fixture value** | `{ file }` or `{ data }` resolved to JSON/text bytes | Ingress routing, agent wiring |
| **Scenario runner** (`dev-once`) | Load scenarios, install context, drive ingress steps, wait, build `SynapseRunArtifact` | Domain adapter logic inside handlers |
| **Ingress app** | Routes, tick HTTP, in-process scenario context store | Scenario file parsing |
| **Adapter boundary** | Match `source` + `method` + `params`, return `returns` payload | Event types, terminal semantics |

**Confusing pairs**

- **Scenario** vs **fixture file:** a scenario *references* fixture data; it is not a duplicate manifest.
- **Scenario** vs **ingress route:** `ingress.source` is a catalog id (`synapse.webhooks.*` or `synapse.poll.*`), not an HTTP path string.
- **`scenarioId` in run artifacts** vs **runtime manifest `name`:** artifact `scenarioId` is the scenario entry id (e.g. `example/echo`); manifest `name` is the session manifest (e.g. `example-echo`).

---

## Authoritative scenario shape (v1)

There is no `kind`, `mode`, `trigger`, `agent`, or fixture-level `adapters`. The canonical scenario object is:

```json
{
  "ingress": {
    "source": "...",
    "fixtures": [
      { "file": "..." }
    ]
  },
  "adapters": [
    {
      "source": "...",
      "method": "...",
      "params": {},
      "returns": { "file": "..." }
    }
  ],
  "terminalEventTypes": ["example.done.v1"]
}
```

| Field | Meaning |
| --- | --- |
| `ingress.source` | Mounted webhook route id or poll source id |
| `ingress.fixtures[]` | Ordered ingress inputs (webhook POST bodies) or poll tick results (mocked poll output for that tick) |
| `adapters[]` | Mocked adapter method calls used during the run |
| `adapters[].returns` | Result returned by that adapter call |
| `terminalEventTypes[]` | Optional; any listed event type completes the wait |

---

## Repository layout (authoritative)

All production paths must use these roots. Paths in manifests and scenarios are **repo-root-relative POSIX** strings.

| Root | Purpose | Examples |
| --- | --- | --- |
| `manifests/` | Runtime manifest JSON | `manifests/application.json`, `manifests/examples/echo.json` |
| `scenarios/` | Scenario files (`*.scenarios.json`) | `scenarios/echo.scenarios.json`, `scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json` |
| `fixtures/` | Static JSON/text payloads only | `fixtures/example-agent-echo/ping.json`, `fixtures/agent-reviewer/gitlab-merge-request.json` |

**Rules**

- Manifest `scenarios[]` entries must start with `scenarios/` and end with `.scenarios.json`.
- Scenario `ingress.fixtures[]` and `adapters[].returns` file paths must start with `fixtures/`.
- `examples/scenarios/` and `examples/fixtures/` are **not** valid locations for new scenario or fixture files. Migrate existing files into `scenarios/` and `fixtures/` (see [Repository cleanup](#repository-cleanup)).
- `examples/agents/` remains the home for example **agent code** only, not scenario or fixture payloads.
- Unit-test-only scenario files may live under `libs/runtime-manifest/test/fixtures/scenarios/`; they are not listed on production manifests.

**Agents** do not reference scenario files. Agents do not parse `*.scenarios.json`.

---

## Runtime manifest (authoritative)

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json",
  "name": "application-default",
  "agents": [
    {
      "name": "agent-reviewer",
      "handler": "agents/agent-reviewer/src/review-pr-agent.ts",
      "handles": ["pr.received.v1"]
    }
  ],
  "webhooks": [
    { "source": "synapse.webhooks.prs.v1" }
  ],
  "scenarios": [
    "scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json"
  ]
}
```

### Manifest fields

| Field | Required | Meaning |
| --- | --- | --- |
| `agents[]` | yes | `name`, `handler`, `handles` only |
| `webhooks[]` | no | Each entry: `{ "source": WebhookRouteId }` from `WEBHOOK_ROUTE_CATALOG` |
| `pollers[]` | no | Each entry: `{ "source": PollSourceId, "intervalMs"?, "lockTtlMs"?, "enabled"?, "params"? }` |
| `scenarios[]` | no | Paths under `scenarios/*.scenarios.json` for `dev:once --list` |

### Manifest rules

- `agents[].adapterFixtures` is **not supported** (schema and Zod must reject it).
- `agents[].fixtures` is **not supported**.
- A scenario is valid for a manifest only if `scenario.ingress.source` is mounted in that manifest’s `webhooks[]` or `pollers[]`.
- Manifest validation must verify: every `scenarios[]` path exists; every scenario file parses; every `ingress.source` is mounted; webhook and poll scenarios have `ingress.fixtures.length >= 1`.

---

## Scenario file (authoritative)

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/scenario/run-loop.v1.schema.json",
  "scenarios": [
    {
      "id": "example/id",
      "title": "Human title",
      "description": "Optional description",
      "ingress": {
        "source": "synapse.webhooks.example-echo-ping.v1",
        "fixtures": [
          { "file": "fixtures/example-agent-echo/ping.json" },
          { "data": { "message": "inline" } }
        ]
      },
      "adapters": [
        {
          "source": "gitlab",
          "method": "fetchChanges",
          "params": { "projectId": 123, "mergeRequestIid": 456 },
          "returns": { "file": "fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json" }
        }
      ],
      "terminalEventTypes": ["example.done.v1"]
    }
  ]
}
```

### Scenario fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable CLI id for `dev:once --scenario <id>` |
| `title` | no | Display label for `dev:once --list` |
| `description` | no | Human explanation |
| `ingress.source` | yes | Mounted webhook route id or poll source id |
| `ingress.fixtures[]` | yes | Ordered ingress fixture values (min 1) |
| `adapters[]` | no | Ordered adapter call mocks for the whole run |
| `terminalEventTypes[]` | no | Event types `dev:once` treats as completion (any match succeeds the wait) |

There is no `agent` field. The owning agent is implied by manifest `agents[].handles` and runtime planning.

### Ingress source resolution

```ts
export type ResolvedIngressSource =
  | { kind: 'webhook'; source: WebhookRouteId; route: WebhookRouteCatalogEntry }
  | { kind: 'poll'; source: PollSourceId; catalog: PollSourceCatalogEntry };

export function resolveScenarioIngressSource(
  source: string,
  manifest: RuntimeManifest,
): ResolvedIngressSource;
```

Algorithm:

1. If `source` ∈ `WEBHOOK_ROUTE_CATALOG` → webhook; require `manifest.webhooks` contains `{ source }`.
2. Else if `source` ∈ `POLL_SOURCE_CATALOG` → poll; require `manifest.pollers` contains `{ source }` with `enabled !== false`.
3. Else → `unknown ingress source: <source>`.

Webhook vs poll is **never** stored on the scenario; it is inferred exclusively from catalog membership.

---

## JSON Schema (`run-loop.v1.schema.json`)

Authoritative `$defs` (implement exactly):

### `fixtureValue`

```json
"fixtureValue": {
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["file"],
      "properties": {
        "file": { "type": "string", "minLength": 1 }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["data"],
      "properties": {
        "data": {}
      }
    }
  ]
}
```

### `adapter`

Rename internal Zod name from `adapterFixture` to `adapter` / `scenarioAdapter` for readability; wire shape unchanged.

```json
"adapter": {
  "type": "object",
  "additionalProperties": false,
  "required": ["source", "method", "returns"],
  "properties": {
    "source": { "type": "string", "minLength": 1 },
    "method": { "type": "string", "minLength": 1 },
    "params": { "type": "object" },
    "returns": { "$ref": "#/$defs/fixtureValue" }
  }
}
```

### `scenario`

```json
"scenario": {
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "ingress"],
  "properties": {
    "id": { "type": "string", "minLength": 1 },
    "title": { "type": "string", "minLength": 1 },
    "description": { "type": "string" },
    "ingress": {
      "type": "object",
      "additionalProperties": false,
      "required": ["source", "fixtures"],
      "properties": {
        "source": { "type": "string", "minLength": 1 },
        "fixtures": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/fixtureValue" }
        }
      }
    },
    "adapters": {
      "type": "array",
      "items": { "$ref": "#/$defs/adapter" }
    },
    "terminalEventTypes": {
      "type": "array",
      "minItems": 1,
      "items": { "type": "string", "minLength": 1 }
    }
  }
}
```

**Remove from schema:** top-level scenario `fixtures`, `webhookFixtureStep`, fixture-level `adapters`, singular `terminalEventType`.

### `terminalEventTypes[]`

- Optional. When omitted, `dev:once` waits only for downstream events implied by the graph after the last ingress step (same as today when no terminal is set).
- When present, `dev:once` completes the wait when **any** listed event type appears in the Postgres graph rooted at the active root event id.
- Supports success/failure pairs in one scenario, e.g. `["ticket.enrichment.succeeded.v1", "ticket.enrichment.failed.v1"]`.
- Between multi-step webhook fixtures, the same array applies: after each POST, wait until any listed type is reachable before the next POST (when more fixtures remain).

### Fixture value rules

- Each `fixtureValue` has exactly one of `file` or `data`.
- File paths must start with `fixtures/`.
- Inline `data`: any JSON value. Webhook POST wire format: `JSON.stringify(data)` with `Content-Type: application/json`.
- Bare strings in `ingress.fixtures[]` are invalid.

---

## TypeScript contracts

```ts
// libs/runtime-manifest/src/scenario-schema.ts

export const scenarioIngressSchema = z
  .object({
    source: z.string().min(1),
    fixtures: z.array(fixtureValueSchema).min(1),
  })
  .strict();

export const scenarioSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    ingress: scenarioIngressSchema,
    adapters: z.array(scenarioAdapterSchema).optional(),
    terminalEventTypes: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();
```

### Package ownership

```text
runtime-manifest:
  scenario JSON schema (Zod + JSON Schema)
  ScenarioFixtureContext wire DTO
  catalog types
  manifest validation hooks (paths, mounted ingress.source)

synapse-scenarios/runtime   (no scenario file I/O):
  createScenarioAdapterQueue
  paramsStructurallyEqual
  resolveFixtureValueJson
  dequeueAdapterReturn

synapse-scenarios/files:
  loadScenariosForManifest
  resolveScenarioById
  resolveFixtureValue (reads repo files)
```

`paramsStructurallyEqual` and FIFO adapter queues are **scenario execution** behavior. They live in `libs/synapse-scenarios` only—not in `runtime-manifest`.

**Import rule:** `apps/ingress` may import `synapse-scenarios/runtime` helpers. It must **not** import `synapse-scenarios/files` (`loadScenariosForManifest`, `resolveScenarioById`, or other scenario-file parsers).

```ts
// libs/runtime-manifest/src/scenario-context.ts — wire DTO

export type ScenarioFixtureContext = {
  scenarioId: string;
  adapters: ScenarioAdapter[];
  /** Resolved JSON for the current poll tick; omitted for webhook-only context installs. */
  ingressFixture?: unknown;
};

export const SCENARIO_CONTEXT_ID_HEADER =
  'X-Synapse-Scenario-Context-Id' as const;
```

```ts
// libs/synapse-scenarios/runtime

export function createScenarioAdapterQueue(
  adapters: ScenarioAdapter[],
): ScenarioAdapterQueue;

export function paramsStructurallyEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean;

export function resolveFixtureValueJson(
  repoRoot: string,
  value: FixtureValue,
): unknown;
```

```ts
// libs/synapse-scenarios/files — file I/O and validation

export function loadScenariosForManifest(
  repoRoot: string,
  manifest: RuntimeManifest,
): ScenarioFile[];

export function resolveScenarioById(
  repoRoot: string,
  manifest: RuntimeManifest,
  scenarioId: string,
): Scenario;

export function resolveFixtureValue(
  repoRoot: string,
  value: FixtureValue,
): unknown;
```

---

## Webhook scenario execution

Example:

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
      "source": "gitlab",
      "method": "fetchChanges",
      "params": { "projectId": 123, "mergeRequestIid": 456 },
      "returns": { "file": "fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json" }
    },
    {
      "source": "pi-review",
      "method": "review",
      "returns": { "file": "fixtures/agent-reviewer/adapters/pi-review-synapse.json" }
    }
  ],
  "terminalEventTypes": ["pr.reviewed.v1"]
}
```

For each entry in `ingress.fixtures[]` in order:

1. Resolve the webhook route from `ingress.source` via `WEBHOOK_ROUTE_CATALOG`.
2. When `adapters[]` is non-empty, install a **fresh** scenario context (see [Scenario context](#scenario-context-authoritative)) before this POST.
3. POST the resolved fixture body to the route.
4. Capture the returned root event id.
5. When `terminalEventTypes[]` is set and more fixtures remain, wait until **any** listed type appears in the graph rooted at this step’s root event id before the next POST.
6. Build the final `tmp/dev/runs/*.json` artifact from the **last** step’s root event (or the root that first matched `terminalEventTypes[]` when poll semantics apply).

### Webhook context transport

```text
dev:once
  -> POST /v1/dev/scenario-context  (per webhook POST when adapters[] present)
  -> POST webhook + X-Synapse-Scenario-Context-Id
  -> apps/ingress: route handler + ctx.emit (ingress-time adapters only)
  -> Postgres
  -> worker: handler uses worker-bound adapter queue from active scenario run file
```

**Context id lifecycle (frozen):** context ids are **single-use**. Middleware resolves `X-Synapse-Scenario-Context-Id`, deletes the store entry, and attaches context for **that request only**. `dev:once` installs a **new** context id immediately before **every** webhook fixture POST when `adapters[]` is present. Scenario-level adapters are reinstalled per step with the same adapter list; each install gets a new queue snapshot (see [FIFO per process boundary](#fifo-per-process-boundary-v1)).

---

## Poll scenario execution

Example:

```json
{
  "id": "example/echo-poll",
  "ingress": {
    "source": "synapse.poll.example-in-memory-heartbeat.v1",
    "fixtures": [
      { "file": "fixtures/example-agent-echo/poll-candidates-empty.json" },
      { "file": "fixtures/example-agent-echo/poll-candidates-one.json" }
    ]
  },
  "terminalEventTypes": ["example.pong.v1"]
}
```

`dev:once` does **not** wait for the configured poll interval. It runs **immediate manual ticks** only.

For each entry in `ingress.fixtures[]` in order:

1. Resolve the poll source from `ingress.source` via `POLL_SOURCE_CATALOG` and manifest `pollers[]`.
2. Resolve the fixture value to JSON (`resolveFixtureValueJson`).
3. `POST /v1/poll/{sourceId}/tick` with `scenarioFixtureContext` including `ingressFixture` set to that JSON.
4. If the tick emits no root event, continue to the next fixture.
5. If the tick emits root event ids, use the first root event id for wait/artifact behavior.
6. Stop when the graph rooted at that event contains **any** type in `terminalEventTypes[]`, or continue until fixtures are exhausted.

Poll scenarios may also declare `adapters[]` when the registrar performs external I/O through fixture-aware clients (same per-boundary FIFO rules as webhooks).

### Poll `ingressFixture` semantics (frozen)

`ingress.fixtures[]` entries are **not** webhook POST bodies on poll scenarios. Each entry is the **mocked poll output for that tick**—whatever shape the owning poll registrar or fixture-aware poll adapter expects for one manual tick.

Wire shape on tick:

```ts
scenarioFixtureContext: {
  scenarioId: string;
  adapters: ScenarioAdapter[];
  ingressFixture?: unknown; // resolved JSON for this tick only
}
```

**Registrar rule:** when `scenarioFixtureContext.ingressFixture` is present, the poll registrar (or fixture-aware poll adapter client) must use it as the current tick’s poll result and must **not** call live external I/O.

**Parsing rule:** the fixture value shape is **source-specific**. The owning registrar or agent poll ingress must **Zod-parse** `ingressFixture` into that source’s expected type (e.g. a bare candidate array `[]`, or `{ "candidates": [...] }`). The scenario file does not declare a poll payload schema; the poll source owner documents the expected fixture JSON in its registrar README or tests.

Example echo poll fixtures:

```json
[]
```

```json
{ "candidates": [{ "id": "c1" }] }
```

Both are valid if the registrar’s schema accepts them; invalid shapes fail at tick time with a parse error naming `scenarioId` and `ingress.source`.

`POST /v1/poll/{sourceId}/inject` is not used by `dev:once`. The endpoint may remain for non-scenario debugging only.

---

## Adapter call semantics

`adapters[]` describes mocked adapter calls for the scenario run. Ingress-time and worker-time calls both use entries from this list, but **not** from a single shared FIFO cursor across processes (see below).

### Matching rules

Match on:

1. `source`
2. `method`
3. `params`, when present on the adapter entry

When multiple entries share the same `source` + `method` + `params`, each queue consumes them **FIFO** within that queue.

`params` comparison uses **stable structural JSON equality** (canonical key ordering and deep equality), not raw `JSON.stringify` on insertion-order-sensitive objects.

Implement as `paramsStructurallyEqual` in `libs/synapse-scenarios/runtime` (see [Package ownership](#package-ownership)).

### FIFO per process boundary (v1)

```text
FIFO consumption is per fixture-aware adapter client queue instance.
V1 does not guarantee a single global FIFO cursor across ingress and worker processes.
```

Each process boundary builds its own queue from the scenario `adapters[]` list when context is installed:

| Boundary | Queue created when | Consumed by |
| --- | --- | --- |
| **Ingress** (`apps/ingress`) | `POST /v1/dev/scenario-context` before each webhook POST (or poll tick body includes adapters) | Ingress-time fixture-aware adapter clients for that request |
| **Worker** | Worker reads `.synapse/active-scenario-run.json` at handler start | Worker fixture-aware adapter clients for that handler invocation |

**Implication:** if ingress calls `foo.get` once and the worker calls `foo.get` once, and the scenario lists two identical `foo.get` entries, **both** boundaries return the **first** entry unless the scenario author duplicates entries per boundary or splits scenarios. Cross-boundary call sequencing (ingress → first, worker → second) is **out of scope** for v1.

**Within one boundary**, repeated identical calls dequeue in order—sufficient for multi-call handler flows.

### Adapter fixture scope

- Scenario adapter fixtures are local to one `dev:once` run.
- They are not stored on the runtime manifest.
- Ingress installs adapters via scenario context HTTP; worker reads the active scenario run file.
- Resolution happens at the **adapter boundary**, not inside handler business logic.

### Fixture-aware enforcement

When scenario context is active and a call goes through a fixture-aware adapter client:

- Missing match → **error**
- No silent fallback to live credentials or live HTTP

### Worker dev binding and single-active-run lock

Before the first ingress step, `dev:once` acquires an exclusive lock and writes `.synapse/active-scenario-run.json`:

```json
{
  "scenarioId": "review-pr/gitlab-synapse",
  "adapters": [ ... ],
  "runId": "scenrun_...",
  "startedAt": "2026-05-21T12:00:00.000Z"
}
```

**Lock file:** `.synapse/active-scenario-run.lock` (same directory). `dev:once` creates the lock before writing the run file; a second concurrent `dev:once` that cannot acquire the lock fails fast with a message naming the active `scenarioId` / `runId`. The lock and run file are removed in a `finally` block when the scenario run completes (success or failure).

Worker processes read `active-scenario-run.json` when `SYNAPSE_DEV_SCENARIO_CONTEXT=1` and build a **worker-local** `createScenarioAdapterQueue(adapters)` for that handler run. The file is read-only for workers in v1 (no cross-process queue mutation).

`agent-reviewer` (and other agents) must **not** load adapter fixture paths from the manifest. Hermetic Pi/GitLab behavior for curriculum scenarios comes from scenario `adapters[]` only.

---

## Scenario context (authoritative)

Gated behind `SYNAPSE_DEV_SCENARIO_CONTEXT=1` on ingress.

### Install (webhook)

```http
POST /v1/dev/scenario-context
Content-Type: application/json

{
  "scenarioFixtureContext": {
    "scenarioId": "review-pr/gitlab-synapse",
    "adapters": [ ... ]
  }
}

-> 200 { "contextId": "scnctx_..." }
```

Webhook POST:

```http
POST <webhook route path>
X-Synapse-Scenario-Context-Id: scnctx_...
Content-Type: application/json

<body from ingress.fixtures[] step>
```

### Poll tick body

```json
POST /v1/poll/{sourceId}/tick

{
  "scenarioFixtureContext": {
    "scenarioId": "example/echo-poll",
    "adapters": [],
    "ingressFixture": { ... resolved JSON ... }
  }
}
```

### Dependency rules

```text
libs/dev-once → synapse-scenarios/files, synapse-scenarios/runtime, runtime-manifest, dev-cli-shared, runtime-store
libs/synapse-scenarios/files → synapse-scenarios/runtime, runtime-manifest
libs/synapse-scenarios/runtime → runtime-manifest (types only)
libs/runtime-manifest → scenario schemas + ScenarioFixtureContext DTO
apps/ingress → runtime-manifest context DTO; synapse-scenarios/runtime only
agents/* → adapters, runtime-agent; synapse-scenarios/runtime for worker fixture clients
```

**Forbidden**

- `apps/ingress` importing `synapse-scenarios/files` (`loadScenariosForManifest`, `resolveScenarioById`, etc.).
- `runtime-manifest` exporting `paramsStructurallyEqual`, FIFO queues, or scenario file loaders.
- `dev:once` passing `--manifest` (manifest comes from `.synapse/dev-session.json` only).
- Top-level scenario `fixtures` or per-fixture `adapters` (schema must reject).
- Concurrent `dev:once` scenario runs without the single-active-run lock.

---

## Validation examples

### Invalid: scenario source not mounted

```json
"ingress": {
  "source": "synapse.poll.foo.v1",
  "fixtures": [{ "data": [] }]
}
```

Fails when manifest has no `pollers: [{ "source": "synapse.poll.foo.v1" }]`.

### Invalid: missing ingress fixtures

Poll and webhook scenarios must declare `ingress.fixtures[]` with at least one entry.

### Invalid: adapter without returns

Every `adapters[]` entry must include `returns`.

### Invalid: paths outside layout roots

- Scenario file at `examples/scenarios/echo.scenarios.json` → fail validation (or migration tooling must rewrite).
- Fixture file reference `examples/fixtures/...` → fail validation.

---

## Repository cleanup

Execute during implementation Task 5. Delete paths only after references are updated and tests pass.

### Move scenario files → `scenarios/`

| From | To |
| --- | --- |
| `fixtures/agent-reviewer/review-pr-gitlab-synapse.scenarios.json` | `scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json` |
| `examples/scenarios/echo.scenarios.json` | `scenarios/echo.scenarios.json` |
| `examples/scenarios/echo-poll.scenarios.json` | `scenarios/echo-poll.scenarios.json` |

Update every manifest `scenarios[]` entry and doc example to the new paths. Remove empty `examples/scenarios/` when done.

### Move fixture payloads → `fixtures/`

| From | To |
| --- | --- |
| `examples/fixtures/example-agent-echo/ping.json` | `fixtures/example-agent-echo/ping.json` |
| `examples/fixtures/example-agent-echo/poll-candidates.json` | `fixtures/example-agent-echo/poll-candidates.json` |
| `examples/fixtures/example-agent-echo/poll-candidates-empty.json` (add if missing) | `fixtures/example-agent-echo/poll-candidates-empty.json` |
| `examples/fixtures/example-agent-echo/poll-candidates-one.json` (add if missing) | `fixtures/example-agent-echo/poll-candidates-one.json` |
| `examples/fixtures/agent-notifier/ticket-opened.json` | `fixtures/agent-notifier/ticket-opened.json` |

Update scenario files, agent ingress default paths, and tests to `fixtures/...` only. Remove empty `examples/fixtures/` when done.

### Delete unused run-loop fixture documents

Remove after scenario migration (no manifest or CLI references remain):

| Path | Reason |
| --- | --- |
| `fixtures/agent-reviewer/review-pr-gitlab-synapse.fixture.json` | Superseded by scenario file |
| `examples/fixtures/example-agent-echo/echo.fixture.json` | Superseded by `scenarios/echo.scenarios.json` |
| `examples/fixtures/example-agent-echo/echo-poll-inject.fixture.json` | Poll inject not used by scenarios |
| `examples/fixtures/example-agent-echo/echo-poll-tick.fixture.json` | Superseded by poll scenario + tick |

Keep `libs/runtime-manifest/test/fixtures/scenarios/dup-a.scenarios.json` and `dup-b.scenarios.json` for unit tests; update their shapes to `ingress.fixtures` during Task 1.

### Manifest updates

| File | Change |
| --- | --- |
| `manifests/application.json` | Remove `adapterFixtures`; point `scenarios[]` at `scenarios/agent-reviewer/...` |
| `manifests/examples/echo.json` | `scenarios/echo.scenarios.json` |
| `manifests/examples/echo-poll.json` | `scenarios/echo.scenarios.json`, `scenarios/echo-poll.scenarios.json` |
| `manifests/examples/all.json` | `scenarios/echo.scenarios.json` |
| `manifests/debug/reviewer-only.json` | Remove `adapterFixtures`; scenario path under `scenarios/` |

---

## Implementation plan

```text
Task 1 Schemas (runtime-manifest): ingress.fixtures, remove adapterFixtures, layout path validation
    |
    v
Task 2 synapse-scenarios: parse, resolve, FIFO adapters, structural params equality
    |
    v
Task 3 apps/ingress: poll tick ingressFixture, webhook context, adapter FIFO consumption
    |
    v
Task 4 dev-once: multi-step webhook + poll fixtures, worker .synapse/active-scenario-run.json
    |
    v
Task 5 Repo layout migration + manifest/scenario file moves + delete unused fixtures
    |
    v
Task 6 agent-reviewer: scenario-only adapter fixtures; remove manifest adapterFixtures loading
    |
    v
Task 7 Docs, rules, smoke, docs-check
```

### Task 1: Schemas and manifest validation

**Files:** `libs/runtime-manifest/schemas/**`, `src/manifest-schema.ts`, `src/scenario-schema.ts`, `src/validate.ts`

**Deliverables**

- `scenario.ingress.fixtures` required; top-level `fixtures` removed
- `agents[].adapterFixtures` removed from JSON Schema and Zod
- Validation: scenario paths under `scenarios/`; fixture file paths under `fixtures/`
- `terminalEventTypes` array in scenario schema

**Acceptance**

- Invalid shapes fail with messages naming `scenario.id` and field path
- Unit tests for schema round-trip and layout path rules

### Task 2: `libs/synapse-scenarios`

**Deliverables**

- Split `runtime/` vs `files/` exports per [Package ownership](#package-ownership)
- `resolveFixtureValue`, `resolveScenarioIngressSource` in `files/`
- `createScenarioAdapterQueue`, `paramsStructurallyEqual` in `runtime/`
- Remove `mergeAdapterFixturesForWebhookStep` / `webhookFixtureStep` support

**Acceptance**

- Duplicate `source+method+params` entries dequeue in order **within one queue instance** in unit tests
- Ingress and worker queue instances each start from the full `adapters[]` list independently

### Task 3: `apps/ingress`

**Deliverables**

- Poll tick honors `ingressFixture` on `scenarioFixtureContext`
- Adapter match uses FIFO + structural params equality
- `POST /v1/dev/scenario-context` unchanged contract, extended context shape

**Acceptance**

- Integration test: multi-fixture poll scenario without `/inject`
- Adapter miss with context present returns error

### Task 4: `libs/dev-once`

**Deliverables**

- Iterate `ingress.fixtures[]` for webhook and poll
- Write/clear `.synapse/active-scenario-run.json` with single-active-run lock
- Fresh `POST /v1/dev/scenario-context` before every webhook POST when `adapters[]` present
- `--scenario` primary; `--fixture` alias
- `--list` from manifest `scenarios[]` only

**Acceptance**

- Multi-step webhook waits on any `terminalEventTypes[]` match between steps
- Poll stops early when any terminal type matches
- Second concurrent `dev:once` fails when lock is held
- Regression: never uses latest-event-by-type fallback

### Task 5: Repository layout migration

**Deliverables**

- All moves and deletes in [Repository cleanup](#repository-cleanup)
- Scenario JSON uses `ingress.fixtures` and `fixtures/` paths

**Acceptance**

- No remaining references to `examples/scenarios/` or `examples/fixtures/` in manifests or scenario files
- `npx nx run-many -t test --all` green

### Task 6: `agent-reviewer` and worker adapter clients

**Deliverables**

- Load adapters from `.synapse/active-scenario-run.json` during dev runs
- Remove `loadAdapterFixturesForAgent` manifest path requirement

**Acceptance**

- `dev:once --scenario review-pr/gitlab-synapse` succeeds with manifest lacking `adapterFixtures`
- Unit tests updated; hermetic mode uses scenario adapters

### Task 7: Documentation and smoke

**Deliverables**

- Update `docs/reference/runtime-manifest.md`, `README.md`, `apps/ingress/README.md`, `.cursor/rules/runtime-manifest.mdc`, `synapse-run-loop.mdc`
- Dev smoke: `example/echo` and `example/echo-poll` scenario ids stable after path migration

**Acceptance**

- `npx nx run-many -t lint,typecheck,test,format --all` green
- Dev smoke per [dev-flow-smoke](.cursor/rules/dev-flow-smoke.mdc)

---

## Definition of done

- [ ] Runtime manifest does not support `agents[].adapterFixtures`.
- [ ] Scenario schema requires `ingress.source` and `ingress.fixtures[]`.
- [ ] Scenario schema has top-level `adapters[]` only; no fixture-level adapters.
- [ ] All scenario files live under `scenarios/`; all fixture file paths use `fixtures/`.
- [ ] Webhook scenarios execute ordered `ingress.fixtures[]` as POST bodies.
- [ ] Poll scenarios execute ordered `ingress.fixtures[]` as immediate manual tick results.
- [ ] Adapter FIFO is per process boundary (ingress queue vs worker queue); no global cross-process cursor.
- [ ] Adapter `params` matching uses stable structural equality (`synapse-scenarios/runtime`).
- [ ] `terminalEventTypes[]` supports multiple terminal outcomes; wait succeeds on any match.
- [ ] Webhook context ids are single-use; fresh context install before every webhook POST when `adapters[]` present.
- [ ] `.synapse/active-scenario-run.lock` prevents concurrent scenario runs.
- [ ] Poll `ingressFixture` is source-parsed with Zod in the owning registrar.
- [ ] `dev:once --list` reads manifest `scenarios[]`.
- [ ] `dev:once --scenario <id>` works for webhook and poll scenarios.
- [ ] `--fixture` remains a compatibility alias for `--scenario`.
- [ ] Poll `/inject` is not used by `dev:once`.
- [ ] Worker reads scenario adapters from `.synapse/active-scenario-run.json` for the active run.
- [ ] Unused run-loop fixture JSON listed in cleanup is deleted.
- [ ] Lint, typecheck, test, format, and dev smoke pass.

---

## Deferred (out of shipped scope)

- **Global FIFO cursor** across ingress and worker (cross-boundary adapter sequencing)
- Mutable `.synapse/active-scenario-run.json` shared queue state updated by ingress and worker
- Repo-wide auto-discovery of `**/*.scenarios.json` for `--list`
- Top-level manifest `adapters` block
- `dev:once --sequence` running multiple scenario ids in one CLI invocation
- `contentType` override for non-JSON webhook bodies
- Interval poll ticks writing `tmp/dev/runs/*.json`
- Renaming manifest `handles` → `events`

---

## Non-goals

- Do not embed fixture paths in `manifest.pollers` or `manifest.webhooks`.
- Do not add `kind`, `mode`, or `trigger` to scenarios.
- Do not keep `adapterFixtures` on manifest agents.
- Do not store scenario files under `fixtures/`.
- Do not store payload files under `scenarios/`.
- Do not teach `dev-once` vendor-specific field semantics.
- Do not use poll `/inject` in the scenario runner.
- Do not use hidden adapter call counters instead of explicit FIFO `adapters[]` entries.
- Do not assume one context id can cover multiple webhook POSTs.
- Do not share a single FIFO cursor across ingress and worker processes in v1.

---

## Review resolution (v1 freeze)

| # | Topic | Resolution |
| --- | --- | --- |
| 1 | Cross-process adapter FIFO | **Per process boundary** in v1; separate ingress and worker queues from the same `adapters[]` list |
| 2 | Webhook context ids | **Single-use**; fresh install before **every** webhook POST when `adapters[]` present |
| 3 | Poll `ingressFixture` | Mocked tick result; **source-local Zod parse** in registrar; no live I/O when set |
| 4 | Terminal wait | **`terminalEventTypes[]`**; wait succeeds when **any** listed type appears |
| 5 | Package ownership | Schemas/DTO in `runtime-manifest`; matching/FIFO in `synapse-scenarios/runtime`; file I/O in `synapse-scenarios/files` |
| 6 | Concurrent runs | **`.synapse/active-scenario-run.lock`** exclusive lock for one active scenario run |
| 7 | Worker binding | Read-only `active-scenario-run.json`; worker builds local adapter queue |

## Freeze gate

Before merge, confirm in code review:

- [ ] `terminalEventTypes[]` in schema and `dev:once` wait logic (any-match).
- [ ] FIFO queues are per ingress request and per worker handler—not one global cursor.
- [ ] Fresh scenario context install before each webhook POST when adapters are present; context ids deleted on first use.
- [ ] Poll registrar Zod-parses `ingressFixture`; tick fails clearly on shape mismatch.
- [ ] `paramsStructurallyEqual` and `createScenarioAdapterQueue` live under `synapse-scenarios/runtime` only.
- [ ] `apps/ingress` does not import `synapse-scenarios/files`.
- [ ] `dev:once` acquires `active-scenario-run.lock` and rejects overlapping scenario runs.
- [ ] No manifest `adapterFixtures`; scenario paths under `scenarios/`; fixture paths under `fixtures/`.

---

## Core contract summary

```text
Manifest files live under manifests/ and list scenario file paths under scenarios/.
Scenario files declare ingress.source, ingress.fixtures[], adapters[], and optional terminalEventTypes[].
Fixture payloads live under fixtures/ only.
ingress.fixtures[] = ordered webhook POST bodies or poll tick results (source-parsed).
ingress.source implies webhook vs poll via catalogs.
Adapter mocks are scenario-scoped with FIFO per process boundary (ingress vs worker).
Webhook context ids are single-use; dev:once installs context before each webhook POST.
dev:once roots graphs on ingress rootEventIds and waits for any terminalEventTypes[] match.
```

Expect shapes like this. Don't implement them, just use them for your reference.

Below are **5 manifest examples** and **5 scenario file examples** using the latest spec shape: manifests load agents/webhooks/pollers/scenario files; scenarios define `ingress.source`, ordered `ingress.fixtures[]`, optional `adapters[]`, and optional `terminalEventTypes[]`. 

## 5 manifest examples

### 1. Application default: PR reviewer via GitLab webhook

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json",
  "name": "application-default",
  "agents": [
    {
      "name": "agent-reviewer",
      "handler": "agents/agent-reviewer/src/review-pr-agent.ts",
      "handles": ["pr.received.v1"]
    }
  ],
  "webhooks": [
    {
      "source": "synapse.webhooks.prs.v1"
    }
  ],
  "scenarios": [
    "scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json"
  ]
}
```

### 2. Example echo: webhook-only

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json",
  "name": "example-echo",
  "description": "Example echo agent with webhook ingress",
  "agents": [
    {
      "name": "example-echo",
      "handler": "examples/agents/example-agent-echo/src/echo-agent.ts",
      "handles": ["example.ping.v1"]
    }
  ],
  "webhooks": [
    {
      "source": "synapse.webhooks.example-echo-ping.v1"
    }
  ],
  "scenarios": [
    "scenarios/echo.scenarios.json"
  ]
}
```

### 3. Example echo poll: poll-only

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json",
  "name": "example-echo-poll",
  "description": "Example echo agent with poll ingress only",
  "agents": [
    {
      "name": "example-echo",
      "handler": "examples/agents/example-agent-echo/src/echo-agent.ts",
      "handles": ["example.ping.v1"]
    }
  ],
  "pollers": [
    {
      "source": "synapse.poll.example-in-memory-heartbeat.v1",
      "intervalMs": 60000,
      "lockTtlMs": 55000,
      "params": {
        "maxCandidates": 1
      }
    }
  ],
  "scenarios": [
    "scenarios/echo-poll.scenarios.json"
  ]
}
```

### 4. Example echo combined: webhook + poll

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json",
  "name": "example-echo-combined",
  "description": "Example echo agent with both webhook and poll ingress",
  "agents": [
    {
      "name": "example-echo",
      "handler": "examples/agents/example-agent-echo/src/echo-agent.ts",
      "handles": ["example.ping.v1"]
    }
  ],
  "webhooks": [
    {
      "source": "synapse.webhooks.example-echo-ping.v1"
    }
  ],
  "pollers": [
    {
      "source": "synapse.poll.example-in-memory-heartbeat.v1",
      "intervalMs": 60000,
      "params": {
        "maxCandidates": 1
      }
    }
  ],
  "scenarios": [
    "scenarios/echo.scenarios.json",
    "scenarios/echo-poll.scenarios.json"
  ]
}
```

### 5. Ticket enricher PoC: Jira poll ingress

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json",
  "name": "ticket-enricher-poc",
  "description": "Code-aware ticket enricher PoC using Jira poll ingress",
  "agents": [
    {
      "name": "agent-ticket-enricher",
      "handler": "agents/agent-ticket-enricher/src/enrich-ticket-agent.ts",
      "handles": ["ticket.enrichment.requested.v1"]
    }
  ],
  "pollers": [
    {
      "source": "synapse.poll.jira.ticket-enrichment.v1",
      "intervalMs": 600000,
      "lockTtlMs": 540000,
      "params": {
        "site": "example.atlassian.net",
        "label": "needs-ai-enrichment",
        "maxPages": 3,
        "pageSize": 50
      }
    }
  ],
  "scenarios": [
    "scenarios/agent-ticket-enricher/jira-ticket-enrichment.scenarios.json"
  ]
}
```

## 5 scenario file examples

### 1. PR reviewer webhook scenario with GitLab + Pi adapter mocks

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/scenario/run-loop.v1.schema.json",
  "scenarios": [
    {
      "id": "review-pr/gitlab-synapse",
      "title": "Review PR (GitLab synapse)",
      "description": "GitLab merge request webhook for agent-reviewer curriculum",
      "ingress": {
        "source": "synapse.webhooks.prs.v1",
        "fixtures": [
          {
            "file": "fixtures/agent-reviewer/gitlab-merge-request.json"
          }
        ]
      },
      "adapters": [
        {
          "source": "gitlab",
          "method": "fetchChanges",
          "params": {
            "projectId": 123,
            "mergeRequestIid": 456
          },
          "returns": {
            "file": "fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json"
          }
        },
        {
          "source": "pi-review",
          "method": "review",
          "returns": {
            "file": "fixtures/agent-reviewer/adapters/pi-review-synapse.json"
          }
        }
      ],
      "terminalEventTypes": ["pr.reviewed.v1"]
    }
  ]
}
```

### 2. Echo webhook scenario with file + inline fixtures

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/scenario/run-loop.v1.schema.json",
  "scenarios": [
    {
      "id": "example/echo",
      "title": "Example echo webhook",
      "description": "Send two echo webhook payloads, one from file and one inline",
      "ingress": {
        "source": "synapse.webhooks.example-echo-ping.v1",
        "fixtures": [
          {
            "file": "fixtures/example-agent-echo/ping.json"
          },
          {
            "data": {
              "message": "hello inline"
            }
          }
        ]
      },
      "terminalEventTypes": ["example.pong.v1"]
    }
  ]
}
```

### 3. Echo poll scenario with empty first tick and one candidate second tick

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/scenario/run-loop.v1.schema.json",
  "scenarios": [
    {
      "id": "example/echo-poll",
      "title": "Example echo poll",
      "description": "First poll returns no candidates; second poll emits one ping",
      "ingress": {
        "source": "synapse.poll.example-in-memory-heartbeat.v1",
        "fixtures": [
          {
            "file": "fixtures/example-agent-echo/poll-candidates-empty.json"
          },
          {
            "file": "fixtures/example-agent-echo/poll-candidates-one.json"
          }
        ]
      },
      "terminalEventTypes": ["example.pong.v1"]
    }
  ]
}
```

### 4. Ticket enricher poll scenario with Jira search and Slack webhook mock

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/scenario/run-loop.v1.schema.json",
  "scenarios": [
    {
      "id": "ticket-enricher/jira-needs-ai-enrichment",
      "title": "Ticket enricher Jira poll",
      "description": "Poll Jira for tickets needing AI enrichment, enrich one ticket, and post to Slack",
      "ingress": {
        "source": "synapse.poll.jira.ticket-enrichment.v1",
        "fixtures": [
          {
            "file": "fixtures/agent-ticket-enricher/jira-search-empty.json"
          },
          {
            "file": "fixtures/agent-ticket-enricher/jira-search-one-ticket.json"
          }
        ]
      },
      "adapters": [
        {
          "source": "pi-harness",
          "method": "enrichTicket",
          "params": {
            "ticketKey": "ENG-123"
          },
          "returns": {
            "file": "fixtures/agent-ticket-enricher/adapters/pi-enrichment-eng-123.json"
          }
        },
        {
          "source": "slack",
          "method": "postWebhook",
          "params": {
            "channel": "#better-tickets"
          },
          "returns": {
            "data": {
              "ok": true,
              "status": 200
            }
          }
        }
      ],
      "terminalEventTypes": [
        "ticket.enrichment.succeeded.v1",
        "ticket.enrichment.failed.v1"
      ]
    }
  ]
}
```

### 5. Handler-state scenario with repeated identical adapter calls consumed FIFO

This one demonstrates the spec’s “FIFO per queue instance” rule for repeated identical adapter calls.

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/scenario/run-loop.v1.schema.json",
  "scenarios": [
    {
      "id": "example/adapter-fifo",
      "title": "Adapter FIFO example",
      "description": "The same adapter method and params return different values on repeated calls within one handler boundary",
      "ingress": {
        "source": "synapse.webhooks.example-echo-ping.v1",
        "fixtures": [
          {
            "data": {
              "message": "exercise repeated adapter calls"
            }
          }
        ]
      },
      "adapters": [
        {
          "source": "example-state",
          "method": "readState",
          "params": {
            "key": "counter"
          },
          "returns": {
            "data": {
              "value": 0
            }
          }
        },
        {
          "source": "example-state",
          "method": "readState",
          "params": {
            "key": "counter"
          },
          "returns": {
            "data": {
              "value": 1
            }
          }
        },
        {
          "source": "example-state",
          "method": "writeState",
          "params": {
            "key": "counter",
            "value": 2
          },
          "returns": {
            "data": {
              "ok": true
            }
          }
        }
      ],
      "terminalEventTypes": ["example.pong.v1"]
    }
  ]
}
```