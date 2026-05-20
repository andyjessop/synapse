# Agent and Adapter definitions — Tidying spec

## Status

Architecture: **approved for implementation** (follow-on to `specs/adapters.md`). **Green-light Phase 1** after this revision; Phase 2 remains a separate atomic PR.

**Post-review revisions (authoritative):** `runtime-agent` stays generic (no `runtime-events`, `runtime-adapters`, or `runtime-worker` imports). Phase 2 `defineAgent` has **no `ingress` field** (Phase 3 only). `usesAdapters` / handle existence validated at manifest load via `knownEventTypes` passed by apps. Phase 2 is an atomic cutover. `agent-test-harness` requires explicit `shippedAgents` (no lib → app import). Adapter source id regex alignment is tested. No source-specific `liveDeps` casts in `apps/adapters` route code.

This spec does **not** replace the adapter RPC runtime model in `specs/adapters.md`. It refactors **how shipped adapters and agents are declared and registered** so manifests stay thin mount lists and registration stops drifting across multiple hand-maintained files.

---

## Goal

Make **code** the source of truth for what an agent or adapter *is*. Make the **manifest** the source of truth for what is *mounted in this session*.

Today the adapter RPC boundaries are correct (runtime libs generic, `adapters/*` own vendor contracts, `apps/adapters` is the composition root, agents call `ctx.adapters`). The developer experience for **adding** capabilities is still too scattered: method registry, live deps, resolver maps, handler paths, and catalog entries are edited in separate places and can drift.

After this work, adding a capability should look like:

```ts
// adapters/adapter-jira/src/jira-adapter.ts
export const jiraAdapter = defineAdapterSource({ ... });

// apps/adapters/src/shipped-adapters.ts
export const shippedAdapters = [gitlabAdapter, jiraAdapter] as const;
```

```ts
// agents/agent-foo/src/foo-agent.definition.ts
export const fooAgent = defineAgent({ ... });

// apps/worker/src/shipped-agents.ts
export const shippedAgents = [reviewPrAgent, fooAgent] as const;
```

```json
{
  "agents": [{ "name": "agent-foo" }],
  "adapters": [{ "source": "synapse.adapters.jira.v1" }]
}
```

### Core idea

An **adapter definition** and **agent definition** are **declarative metadata + wiring** compiled into each app process. They are **not** shared singleton instances across `apps/ingress`, `apps/worker`, and `apps/adapters`. Cross-process adapter execution stays HTTP RPC through `apps/adapters`; agents still use `ctx.adapters` / `invokeAdapter`.

### Core stack (unchanged)

| Layer | Technology | Purpose |
| --- | --- | --- |
| Adapter RPC | `apps/adapters` + `runtime-adapters` | Bounded JSON IO, scenario FIFO, live execution |
| Agent runtime | `apps/worker` + `runtime-agent` | Event planning and handler execution |
| Ingress | `apps/ingress` | HTTP webhooks and poll supervisors |
| Manifest | JSON + `runtime-manifest` | Session mount list only (target state) |
| Durable events | Postgres + BullMQ | Append-only event log and worker job execution |

### Key architectural distinction

| Concept | Meaning |
| --- | --- |
| **Definition** | Declarative metadata plus function references (`createLiveDeps`, `run`, `emit`) compiled into one app process — not JSON-serializable |
| **Instance** | Per-process constructed state (live GitLab client, scenario FIFO store in `apps/adapters`) |
| **Mount** | Manifest entry selecting which shipped definitions are active in this session |

Do **not** model adapters as `new MyAdapter()` shared across processes. Model them as `defineAdapterSource({ ... })` imported by `apps/adapters`, which builds **local** live deps and serves RPC.

### Naming conventions

| Pattern | Role |
| --- | --- |
| `defineAdapterSource` | Declares one adapter source and all its methods |
| `defineAgent` | Declares one agent capability |
| `shippedAdapters` | `apps/adapters` composition list |
| `shippedAgents` | `apps/worker` composition list |
| `adapter-*/definition` | Subpath export: full adapter source definition (`apps/adapters` only) |
| `agent-*/definition` | Subpath export: full agent definition (`apps/worker` only) |
| `adapter-*` (default) | Contracts only (agents, tests) |
| Source id | `synapse.adapters.{family}.v{N}` — **no slashes** in `{family}` |

### Architecture slogan

```text
Definitions describe shape.
Manifests choose mounts.
apps/adapters and apps/worker compose what ships.
Processes invoke; they do not share adapter instances.
```

### Non-negotiables

1. **Process boundaries unchanged.** Worker, ingress, and adapters remain separate Node processes. Adapter calls from worker/ingress go through `ADAPTERS_BASE_URL` when dev scenario context or production wiring requires it.
2. **`libs/runtime-*` stay generic.** No vendor schemas, no GitLab/Jira clients, no shipped catalogs in `runtime-manifest`.
3. **`apps/adapters` imports adapter definitions only** (`adapter-*/definition` from `shipped-adapters.ts` after Phase 1 — not `adapter-*/methods`). Agents import **contracts only** (`adapter-gitlab`, not `/definition` or `/methods`).
4. **No `apps/platform` in shipped scope.** Composition roots stay per app: `shipped-adapters.ts`, `shipped-agents.ts`. Deferred: unified product registry package.
5. **`runtime-manifest` never imports shipped definitions.** It validates manifests using `shippedAgents` / adapter catalogs **passed in by apps** (`apps/worker`, `apps/adapters`). Same rule as today for adapter catalogs: apps compose, runtime validates.
6. **`runtime-agent` stays generic.** No import of `runtime-events`, `runtime-adapters`, or `runtime-worker`. Product event-type and adapter-mount validation runs in `loadValidatedManifestRegistry` using `knownEventTypes` and `shippedAgents` **passed in by apps** (worker imports `eventRegistry`; `runtime-manifest` does not).
7. **Source id pattern strict:** `^synapse\.adapters\.[a-z0-9-]+\.v[0-9]+$` — no `/`, `#`, `?`, or `.` inside `{family}` beyond the fixed segments. Canonical pattern lives in `runtime-adapters`; `defineAgent` duplicates the regex locally (must stay aligned; see below).

---

## Problem statement (current state)

### Adapter registration today (scattered)

| Concern | Current file(s) | Drift risk |
| --- | --- | --- |
| Register methods | `apps/adapters/src/method-registry.ts` | Must list each `defineAdapterMethod` export |
| Live deps shape | `apps/adapters/src/live-deps.ts` | Manual `AdapterLiveDeps` keyed union per source |
| Live deps resolver | `apps/adapters/src/live-deps-resolvers.ts` | Manual map `source → requireXLiveDeps` |
| Shipped catalog | `apps/adapters/src/adapter-source-catalog.ts` | Derived from registry today, but live deps still manual |
| Method module | `adapters/adapter-gitlab/src/methods/fetch-changes.ts` | Separate from live client wiring |
| Live client | `adapters/adapter-gitlab/src/live-client.ts` + `live.ts` barrel | Duplicated knowledge of env vars |

Adding `gitlab.getPipelineStatus` today requires: method file, `method-registry.ts` import — **no** resolver change (good), but still **two** app files if live deps type changes.

Adding `synapse.adapters.jira.v1` today requires: new package, method registry, `AdapterLiveDeps` type, `createAdapterLiveDeps` branch, `liveDepsResolvers` entry, manifest mount.

### Agent registration today (scattered)

| Concern | Current file(s) | Drift risk |
| --- | --- | --- |
| Handler implementation | `agents/agent-reviewer/src/review-pr-agent.ts` | OK |
| Manifest handler path | `manifests/application.json` `handler` field | Duplicates package location |
| Manifest handles | Same manifest `handles` array | Duplicates agent code / registry |
| Dynamic import | `libs/runtime-manifest/src/resolve-handler.ts` | Allowlist `agents/`, `examples/agents/` |
| Ingress route | `apps/ingress/src/routes/prs.ts` | Separate from agent package |
| Ingress catalog | `libs/runtime-manifest/src/webhook-route-catalog.ts` | Separate from route |

### What stays good (do not regress)

- `ctx.adapters` / `invokeAdapter` from agents.
- Scenario FIFO and `scenarioRunId` cross-process binding (`.synapse/active-scenario-run.json` + `SYNAPSE_DEV_SCENARIO_CONTEXT`).
- Architecture tests in `test/architecture/runtime-boundaries.test.ts`.
- `adapter-gitlab` default export contracts-only; subpaths `methods`, `live`, `fixtures`, `testing`.

---

## Target mental model

```text
adapters/adapter-gitlab/src/gitlab-adapter.ts
  └── defineAdapterSource({ source, createLiveDeps, methods: { fetchChanges: ... } })

apps/adapters/src/shipped-adapters.ts
  └── [gitlabAdapter]  →  derive registry + catalog + liveDeps

agents/agent-reviewer/src/review-pr-agent.definition.ts
  └── defineAgent({ name, handles, usesAdapters, run })

apps/worker/src/shipped-agents.ts
  └── [reviewPrAgent, exampleEchoAgent, ...]  →  resolve manifest agent names

manifests/*.json
  └── { "agents": [{ "name": "agent-reviewer" }], "adapters": [{ "source": "..." }] }
```

```text
┌─────────────────┐     HTTP RPC      ┌──────────────────┐
│  apps/worker    │ ────────────────► │  apps/adapters   │
│  shippedAgents  │                   │  shippedAdapters│
│  ctx.adapters   │                   │  liveDeps[source]│
└─────────────────┘                   └──────────────────┘
        ▲                                       ▲
        │ manifest mounts names/sources         │
        └───────────────────────────────────────┘
```

---

## Authoritative contracts (shipped scope)

### `defineAdapterSource` (Phase 1)

**File:** `libs/runtime-adapters/src/define-adapter-source.ts` (create)  
**Export from:** `libs/runtime-adapters/src/index.ts`

```ts
import type { z } from 'zod';
import type { AdapterMethodBoundary, RegisterableAdapterMethod } from './types.js';

/** Adapter source id: synapse.adapters.{family}.v{N} — family is lowercase alphanumeric + hyphens only. */
export const ADAPTER_SOURCE_ID_PATTERN =
  /^synapse\.adapters\.[a-z0-9-]+\.v[0-9]+$/;

export type AdapterSourceMethod<LiveDeps> = Omit<
  RegisterableAdapterMethod,
  'invokeLive'
> & {
  readonly invokeLive: (
    params: unknown,
    deps: LiveDeps,
  ) => Promise<unknown>;
};

export type AdapterMethodDefinitionsFor<LiveDeps> = Record<
  string,
  AdapterSourceMethod<LiveDeps>
>;

export type AdapterSourceDefinition<LiveDeps = unknown> = {
  readonly source: string;
  readonly description: string;
  readonly createLiveDeps: (
    env: Record<string, string | undefined>,
  ) => LiveDeps | undefined;
  readonly methods: AdapterMethodDefinitionsFor<LiveDeps>;
};

export function defineAdapterSource<LiveDeps>(
  definition: AdapterSourceDefinition<LiveDeps>,
): AdapterSourceDefinition<LiveDeps>;
```

**Runtime validation inside `defineAdapterSource`:**

- `definition.source` must match `ADAPTER_SOURCE_ID_PATTERN` or throw `Error` with message `Invalid adapter source id: ${source}`.
- Every key in `definition.methods` must be a non-empty camelCase method name matching `/^[a-z][a-zA-Z0-9]*$/`.
- Every method’s `source` field must equal `definition.source` or throw.
- Every method’s `method` field must equal the record key or throw.

`defineAdapterMethod` **remains** for method bodies inside `methods`; it is not removed. Methods are built with `defineAdapterMethod<Params, Result, LiveDeps>({...})` so each method’s `invokeLive` deps type matches the source’s `LiveDeps`. **Deferred (not required for Phase 1):** compile-time proof that every method in `methods` shares the same `LiveDeps` generic — v1 relies on `AdapterSourceMethod<LiveDeps>` + review; tightening `defineAdapterSource` generics further is optional follow-up.

### Build helpers derived from shipped adapters (Phase 1)

**File:** `libs/runtime-adapters/src/build-shipped-adapter-runtime.ts` (create)  
**Export from:** `libs/runtime-adapters/src/index.ts`

```ts
export type BuiltShippedAdapterRuntime = {
  readonly sources: readonly AdapterSourceDefinition[];
  readonly methodRegistry: AdapterMethodRegistry;
  readonly shippedAdapterSources: Record<string, ShippedAdapterSourceEntry>;
  readonly createLiveDeps: (
    env: Record<string, string | undefined>,
  ) => Record<string, unknown>;
};

export function buildShippedAdapterRuntime(
  sources: readonly AdapterSourceDefinition[],
): BuiltShippedAdapterRuntime;
```

**Authoritative derivation rules:**

1. **Method registry:** For each source, for each `[methodName, methodDef]` in `source.methods`, register `methodDef` via existing `registerAdapterMethods`. Duplicate `(source, method)` across the shipped list throws the same error as today’s registry duplicate test.
2. **Shipped catalog:** `shippedAdapterSources[source.source] = { description: source.description, methods: sorted method names }`.
3. **Live deps bag:** `createLiveDeps(env)` returns `Record<string, unknown>` where key is `source.source` and value is `source.createLiveDeps(env)` **only when** the return value is not `undefined`.

**Missing live deps contract (authoritative):**

```text
createLiveDeps returning undefined does NOT mean the source is unmounted.
It means live execution is unavailable for this process (e.g. missing GITLAB_TOKEN).
Scenario execution may still work when a scenarioRunId is present and fixtures are installed.
Live invoke for a mounted source with missing live deps returns adapter_live_deps_missing at invoke time.
```

A mounted adapter can be scenario-backed without credentials. Manifest mount, shipped catalog, and method registry are unchanged when live deps are omitted from the bag.

**`ShippedAdapterSourceEntry`** moves to `libs/runtime-adapters/src/shipped-adapter-catalog.ts` (create) and is exported for `apps/adapters` and tests. **Delete** duplicate type from `apps/adapters/src/adapter-source-catalog.ts` after migration.

### `defineAgent` (Phase 2)

**File:** `libs/runtime-agent/src/define-agent.ts` (create)  
**Export from:** `libs/runtime-agent/src/index.ts`

```ts
import type { AgentHandler, AgentSqliteDefinition } from './types.js';

/**
 * Must stay aligned with ADAPTER_SOURCE_ID_PATTERN in runtime-adapters.
 * Export .source string from both packages; test/architecture asserts equality (see P1-T4).
 */
export const ADAPTER_SOURCE_ID_PATTERN =
  /^synapse\.adapters\.[a-z0-9-]+\.v[0-9]+$/;

/**
 * Canonical Synapse event type shape (aligned with libs/runtime-events and docs/reference/event-contracts.md).
 * Hyphenated segments and .vN version suffix required.
 */
export const AGENT_HANDLE_PATTERN =
  /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.v[1-9][0-9]*$/;

export type AgentDefinition = {
  readonly name: string;
  readonly handles: readonly string[];
  readonly usesAdapters?: readonly string[];
  readonly run: AgentHandler;
  readonly agentSqlite?: AgentSqliteDefinition;
};

export function defineAgent(definition: AgentDefinition): AgentDefinition;
```

**Phase 2 scope:** `AgentDefinition` has **no `ingress` field**. Do not import `runtime-worker` from `runtime-agent`. Ingress bindings are Phase 3 (see below).

**Validation inside `defineAgent` (shape only — `runtime-agent` stays product-agnostic):**

- `name` must match `/^(agent|example)-[a-z0-9-]+$/` (covers both `agents/*` and `examples/agents/*` without a `kind` field or import-path inspection).
- `handles` non-empty; each entry must match `AGENT_HANDLE_PATTERN`. **Do not** import `eventRegistry` here.
- `usesAdapters` entries must each match `ADAPTER_SOURCE_ID_PATTERN` (local regex; must stay aligned with `runtime-adapters` — guarded by alignment test).

**Composition-time validation in `loadValidatedManifestRegistry` / `validateRuntimeManifest` (Phase 2):**

- Caller (`apps/worker`) passes `knownEventTypes: ReadonlySet<string>` (typically `new Set(Object.keys(eventRegistry))` from `runtime-events`). **`runtime-manifest` must not import `runtime-events`.**
- For each mounted agent, every `agentDef.handles[]` entry must be in `knownEventTypes` or throw (same semantics as today’s manifest `handles` validation — moved to shipped-agent resolution).
- `usesAdapters` mount check (see Phase 2 validation block below).

### Manifest agent entry (Phase 2)

**File:** `libs/runtime-manifest/src/manifest-schema.ts` (modify)

**Replace** `runtimeManifestAgentSchema` with:

```ts
export const runtimeManifestAgentSchema = z
  .object({
    name: z.string().min(1),
  })
  .strict();
```

**Remove** `handler` and `handles` from manifest JSON and from `schemas/manifest/runtime.v1.schema.json`.

**Authoritative example** (`manifests/application.json` after Phase 2):

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json",
  "name": "application-default",
  "agents": [{ "name": "agent-reviewer" }],
  "webhooks": [{ "source": "synapse.webhooks.prs.v1" }],
  "adapters": [{ "source": "synapse.adapters.gitlab.v1" }],
  "scenarios": ["scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json"]
}
```

### `loadValidatedManifestRegistry` (Phase 2)

**File:** `libs/runtime-manifest/src/load.ts` (modify)

**New required parameter:**

```ts
export async function loadValidatedManifestRegistry(input: {
  repoRoot: string;
  manifestPath: string;
  shippedAgents: ReadonlyMap<string, AgentDefinition>;
  env?: Record<string, string | undefined>;
  agentSqliteByAgent?: ReadonlyMap<string, AgentSqliteDefinition>;
  validateScenarioForManifest?: (...) => void;
}): Promise<{ manifest; registry; handlers }>;
```

**Authoritative resolution algorithm:**

1. Parse manifest JSON.
2. For each `manifest.agents[].name`:
   - Look up `input.shippedAgents.get(name)`.
   - If missing → throw `Error: Manifest mounts unknown agent: ${name}. Add it to apps/worker/src/shipped-agents.ts.`
3. Build `handlers: Map<string, AgentHandler>` keyed by **agent name** (not handler path): `handlers.set(agentDef.name, agentDef.run)`.
4. Build synthetic manifest agents for registry: `{ name, handles: agentDef.handles }` (handles taken from definition, not JSON).
5. `validateRuntimeManifest` receives `knownEventTypes: ReadonlySet<string>` from the caller (worker passes `Object.keys(eventRegistry)`). For each mounted `agentDef`, every `agentDef.handles[]` entry must be in `knownEventTypes` or throw with message `Agent ${name} handles unknown event type: ${eventType}`.
6. **Delete** `resolveManifestHandlers` usage from this path — **remove** `importAgentHandlerModule` in Phase 2 (no transitional half-loader).

**Phase 2 atomic cutover (authoritative):**

```text
Phase 2 lands as one PR: manifest schema, all manifest JSON files, shippedAgents wiring, and deletion of resolve-handler.ts / handler-path.ts together.
Do NOT support mixed manifests (some agents with handler paths, some name-only).
Do NOT keep SYNAPSE_ALLOW_LOCAL_MANIFEST_IMPORTS or a compatibility loader for handler paths.
```

**Manifest cannot override agent handles (intentional):**

```text
Manifests cannot override agent handles. To change subscriptions, edit the agent definition or add a separate debug agent definition (e.g. agent-reviewer-debug) and mount that name in a debug manifest.
```

Debug manifests that today tweak `handles` in JSON lose that override; the tradeoff is accepted for a single source of truth in code.

**Files to delete in Phase 2:**

- `libs/runtime-manifest/src/resolve-handler.ts` — delete entire file.
- `libs/runtime-manifest/src/handler-path.ts` — delete entire file.
- Tests: `libs/runtime-manifest/test/unit/handler-path.test.ts` — delete.

**Exports to remove from `libs/runtime-manifest/src/index.ts`:**

- `resolveManifestHandlers`, `importAgentHandlerModule`, `assertHandlerPathAllowlisted`, `resolveHandlerPathForImport`, `resolveHandlerAbsolutePath`, `isLocalManifestImportsAllowed`.

---

## Phase 1 — Adapter source definitions (do first)

### GitLab adapter package layout (target)

```text
adapters/adapter-gitlab/src/
  contracts.ts          # unchanged role: re-export client + schemas
  client.ts
  schemas.ts
  live-client.ts
  fixture-client.ts
  fixtures.ts
  mock-client.ts
  gitlab-adapter.ts     # NEW: defineAdapterSource + export gitlabAdapter
  methods/fetch-changes.ts  # slim: only defineAdapterMethod, imported into gitlab-adapter.ts
  definition.ts         # NEW: re-export gitlabAdapter only
  index.ts              # contracts-only default export (unchanged)
  methods.ts            # DELETE after migration (barrel no longer needed for apps/adapters)
  live.ts               # KEEP: live client factories for createLiveDeps body
  testing.ts
```

### `gitlabAdapter` (authoritative)

**File:** `adapters/adapter-gitlab/src/gitlab-adapter.ts` (create)

```ts
import { defineAdapterSource } from 'runtime-adapters';
import { createGitLabMergeRequestLiveClient } from './live-client.js';
import { gitlabFetchChangesMethod } from './methods/fetch-changes.js';

export const gitlabAdapter = defineAdapterSource({
  source: 'synapse.adapters.gitlab.v1',
  description: 'GitLab merge request IO',
  createLiveDeps(env) {
    const token = env.GITLAB_TOKEN?.trim();
    if (token === undefined || token === '') {
      return undefined;
    }
    return {
      gitlabClient: createGitLabMergeRequestLiveClient({
        token,
        ...(env.GITLAB_BASE_URL?.trim()
          ? { baseUrl: env.GITLAB_BASE_URL.trim() }
          : {}),
      }),
    };
  },
  methods: {
    fetchChanges: gitlabFetchChangesMethod,
  },
});
```

**File:** `adapters/adapter-gitlab/src/definition.ts` (create)

```ts
export { gitlabAdapter } from './gitlab-adapter.js';
export type { GitlabFetchChangesDeps } from './methods/fetch-changes.js';
```

**`methods/fetch-changes.ts`:** Keep `gitlabFetchChangesMethod` and `GitlabFetchChangesDeps`. No `createLiveDeps` in this file.

### Package exports (Phase 1)

**File:** `adapters/adapter-gitlab/package.json` (modify `exports`)

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./definition": "./src/definition.ts",
    "./live": "./src/live.ts",
    "./fixtures": "./src/fixtures.ts",
    "./testing": "./src/testing.ts"
  }
}
```

**Remove** `"./methods": "./src/methods.ts"` — `apps/adapters` must not import `adapter-gitlab/methods` after Phase 1.

**File:** `tsconfig.json` (modify `paths`)

```json
"adapter-gitlab/definition": ["./adapters/adapter-gitlab/src/definition.ts"]
```

Remove `adapter-gitlab/methods` path alias.

### `apps/adapters` composition (target)

**File:** `apps/adapters/src/shipped-adapters.ts` (create)

```ts
import { gitlabAdapter } from 'adapter-gitlab/definition';

export const shippedAdapters = [gitlabAdapter] as const;

export type ShippedAdapterSourceDefinition =
  (typeof shippedAdapters)[number];
```

**File:** `apps/adapters/src/shipped-adapter-runtime.ts` (create)

```ts
import { buildShippedAdapterRuntime } from 'runtime-adapters';
import { shippedAdapters } from './shipped-adapters.js';

export const builtShippedAdapterRuntime =
  buildShippedAdapterRuntime(shippedAdapters);

export const adapterMethodRegistry = builtShippedAdapterRuntime.methodRegistry;
export const SHIPPED_ADAPTER_SOURCES =
  builtShippedAdapterRuntime.shippedAdapterSources;
export const createAdapterLiveDeps =
  builtShippedAdapterRuntime.createLiveDeps;
```

**Files to delete (Phase 1):**

| File | Reason |
| --- | --- |
| `apps/adapters/src/method-registry.ts` | Replaced by `shipped-adapter-runtime.ts` |
| `apps/adapters/src/live-deps.ts` | Replaced by derived `createAdapterLiveDeps` |
| `apps/adapters/src/live-deps-resolvers.ts` | **Eliminated** — deps are `liveDeps[source]` directly |
| `apps/adapters/src/adapter-source-catalog.ts` | Replaced by exports from `shipped-adapter-runtime.ts` |

### `execute-adapter-invoke.ts` (modify)

**File:** `apps/adapters/src/invoke/execute-adapter-invoke.ts`

**Replace** `resolveLiveDepsForSource(input.source, input.liveDeps)` with:

```ts
const deps = input.liveDeps[input.source];
if (deps === undefined) {
  throw new AdapterLiveDepsMissingError(
    `Live deps missing for adapter source ${input.source}. Mount the source in the manifest and configure env for apps/adapters.`,
  );
}
return await input.methodDef.invokeLive(input.params, deps);
```

**Type:** Change `AdapterLiveDeps` from keyed union in deleted `live-deps.ts` to `Record<string, unknown>` exported from `apps/adapters/src/shipped-adapter-runtime.ts` (alias of built runtime live deps return type).

**Live deps typing rule (authoritative):**

```text
apps/adapters route and composition code (execute-adapter-invoke, invoke routes, app.ts) must NOT cast liveDeps[source] to vendor-specific types.
Pass Record<string, unknown> through to methodDef.invokeLive only.
Any narrowing belongs inside defineAdapterMethod invokeLive implementations or inside runtime-adapters build/invoke internals — never in apps/adapters.
```

Phase 1 does not require compile-time proof that each method’s deps match its source’s LiveDeps; unsafe casts in app code are forbidden anyway.

### Import graph after Phase 1

| Consumer | Import |
| --- | --- |
| `apps/adapters/src/shipped-adapters.ts` | `adapter-gitlab/definition` only |
| `apps/adapters/src/app.ts` | `./shipped-adapter-runtime.js` for `createAdapterLiveDeps` |
| `apps/adapters/src/routes/invoke.ts` | `adapterMethodRegistry`, `SHIPPED_ADAPTER_SOURCES` from `./shipped-adapter-runtime.js` |
| `agents/*` | `adapter-gitlab` (contracts) only — unchanged |
| `libs/runtime-manifest` | **no** adapter catalog — unchanged |

### Simplifications from Phase 1

1. **Adding a method** on `synapse.adapters.gitlab.v1`: edit `gitlab-adapter.ts` `methods` record only; **no** `apps/adapters` file edits.
2. **Adding a new source:** one adapter package + one line in `shipped-adapters.ts`; registry, catalog, and live deps derivation automatic.
3. **Removes** `liveDepsResolvers` and `requireGitlabLiveDeps` — entire class of per-source resolver bugs.
4. **Single** `SHIPPED_ADAPTER_SOURCES` derivation path (already partially true; now includes live deps).

---

## Phase 2 — Agent definitions

### `agent-reviewer` definition (authoritative)

**File:** `agents/agent-reviewer/src/review-pr-agent.definition.ts` (create)

- Import `defineAgent` from `runtime-agent`.
- Import `runReviewPrAgent` (rename export if needed) from `./review-pr-agent.js` as `run`.
- Set `name: 'agent-reviewer'`, `handles: ['pr.received.v1']`, `usesAdapters: ['synapse.adapters.gitlab.v1']`.
- **Do not** embed full ingress in Phase 2 shipped scope — `ingress` field omitted until Phase 3; `apps/ingress/src/routes/prs.ts` stays.

**File:** `agents/agent-reviewer/src/definition.ts` (create)

```ts
export { reviewPrAgent } from './review-pr-agent.definition.js';
```

**File:** `agents/agent-reviewer/package.json` (modify)

```json
"exports": {
  ".": "./src/index.ts",
  "./definition": "./src/definition.ts"
}
```

**File:** `tsconfig.json` — add `"agent-reviewer/definition": ["./agents/agent-reviewer/src/definition.ts"]`.

Repeat the same pattern for every agent mounted in any shipped manifest:

| Package | Definition export name | `shipped-agents.ts` import |
| --- | --- | --- |
| `agent-reviewer` | `reviewPrAgent` | `agent-reviewer/definition` |
| `example-agent-echo` | `exampleEchoAgent` | `example-agent-echo/definition` |
| `example-agent-dialogue` | `exampleDialogueAgent` | `example-agent-dialogue/definition` |
| `example-agent-notifier` | `exampleNotifierAgent` | `example-agent-notifier/definition` |
| `example-agent-pipeline` | `examplePipelineAgent` | `example-agent-pipeline/definition` |
| `example-agent-splitter` | `exampleSplitterAgent` | `example-agent-splitter/definition` |
| `example-agent-sqlite-counter` | `exampleSqliteCounterAgent` | `example-agent-sqlite-counter/definition` |
| `example-agent-sqlite-notebook` | `exampleSqliteNotebookAgent` | `example-agent-sqlite-notebook/definition` |

Each example agent gets `examples/agents/<pkg>/src/<name>-agent.definition.ts` + `definition.ts` barrel.

### `apps/worker` composition

**File:** `apps/worker/src/shipped-agents.ts` (create)

```ts
import { reviewPrAgent } from 'agent-reviewer/definition';
import { exampleEchoAgent } from 'example-agent-echo/definition';
// ... all example agents used by manifests/examples/*.json

export const shippedAgents = [
  reviewPrAgent,
  exampleEchoAgent,
  // ...
] as const;

export const shippedAgentsByName = new Map(
  shippedAgents.map((a) => [a.name, a]),
);
```

**File:** `apps/worker/src/manifest-registry.ts` (modify)

```ts
import { shippedAgentsByName } from './shipped-agents.js';

await loadValidatedManifestRegistry({
  repoRoot,
  manifestPath,
  env,
  shippedAgents: shippedAgentsByName,
  validateScenarioForManifest,
});
```

### `agent-test-harness` (modify)

**Do not** add `libs/agent-test-harness/src/default-shipped-agents.ts` importing `apps/worker` — **libs must not import apps**.

**File:** `libs/agent-test-harness/src/index.ts` and `start-test-dev-server.ts`

**Required parameter** on harness entrypoints that load a manifest registry:

```ts
export type StartTestDevServerInput = {
  manifestPath: string;
  shippedAgents: ReadonlyMap<string, AgentDefinition>;
  // ...existing fields
};
```

Callers (integration tests under `agents/*`, `examples/agents/*`, or `apps/worker/test`) import `shippedAgentsByName` from `apps/worker/src/shipped-agents.js` and pass it explicitly:

```ts
import { shippedAgentsByName } from '../../../apps/worker/src/shipped-agents.js';

await withTestDevServer(
  { manifestPath, shippedAgents: shippedAgentsByName },
  async (dev) => { ... },
);
```

The harness stays generic; composition stays in apps/tests.

### Manifest files to update (Phase 2)

| File | Change |
| --- | --- |
| `manifests/application.json` | Remove `handler`, `handles` from `agent-reviewer` entry |
| `manifests/examples/echo.json` | Remove `handler`, `handles` from `example-echo` |
| `manifests/examples/*.json` | Same for all example manifests |
| `manifests/debug/*.json` | Same if they mount agents |

### Simplifications from Phase 2

1. **No dynamic handler imports** — worker bundle resolves agents at compile time from `shipped-agents.ts`.
2. **No handler path allowlist** — deleted with `handler-path.ts`.
3. **`handles` single source of truth** — agent definition only; manifest cannot override (debug manifests must use a different agent name or definition).
4. **`usesAdapters` documentation** — validate at manifest load: every adapter in `usesAdapters` must appear in `manifest.adapters` when both are present.

**New validation** in `validateRuntimeManifest` (Phase 2):

```ts
for (const agentName of manifest.agents) {
  const def = shippedAgents.get(agentName.name);
  for (const source of def.usesAdapters ?? []) {
    if (!manifest.adapters?.some((a) => a.source === source)) {
      throw new Error(
        `Agent ${def.name} uses adapter ${source} but manifest does not mount it`,
      );
    }
  }
}
```

---

## Phase 3 — Generic ingress from agent definitions (deferred)

**Deferred until this spec’s Phase 1 and Phase 2 are merged and stable.**

### Ingress types live in `runtime-agent` only (Phase 3)

**Do not** reference `runtime-worker.IngressContext` from `runtime-agent`. `runtime-worker` sits above `runtime-agent` and adapts worker ingress plumbing to agent-owned bindings.

**File:** `libs/runtime-agent/src/agent-ingress.ts` (create in Phase 3)

```ts
import type { z } from 'zod';

/** Minimal emit surface — satisfied by runtime-worker ingress ctx adapters. */
export type AgentIngressEmitContext = {
  emit(
    type: string,
    data: unknown,
    options: { source: string; externalId: string; subject?: string },
  ): Promise<{ id: string }>;
};

export type AgentWebhookIngressBinding = {
  readonly source: string;
  readonly method: 'POST';
  readonly path: string;
  readonly bodySchema: z.ZodType<unknown>;
  readonly emit: (input: {
    ctx: AgentIngressEmitContext;
    body: unknown;
    headers: Record<string, string | undefined>;
  }) => Promise<{ eventId: string }>;
};

export type AgentIngressDefinition = {
  readonly webhooks?: readonly AgentWebhookIngressBinding[];
};
```

**Phase 3 extends `AgentDefinition`:**

```ts
export type AgentDefinition = {
  // ...Phase 2 fields
  readonly ingress?: AgentIngressDefinition;
};
```

### Target wiring (document only)

**File:** `apps/ingress/src/shipped-ingress.ts` (future)

- Collect `ingress.webhooks` from mounted `shippedAgents` definitions (or a dedicated `shippedIngress` list).
- `mountGenericWebhookRoute(app, binding)` replaces per-agent `apps/ingress/src/routes/prs.ts`.
- `runtime-worker` maps its ingress context to `AgentIngressEmitContext` when calling `binding.emit`.

**Delete (future):** `apps/ingress/src/routes/prs.ts` after `reviewPrAgent.ingress` carries PR webhook binding.

**Keep during deferral:** `libs/runtime-manifest/src/webhook-route-catalog.ts` and existing route files (`apps/ingress/src/routes/prs.ts` unchanged through Phase 2).

---

## Runtime library layering (authoritative)

```text
runtime-adapters: generic adapter source/method primitives (defineAdapterSource, defineAdapterMethod, buildShippedAdapterRuntime)
runtime-agent:    generic agent definition primitive (defineAgent) — no runtime-events, no runtime-adapters
runtime-manifest: validates mounted definitions passed in by apps — never imports shipped lists
apps/adapters:    shipped adapter composition root (shipped-adapters.ts)
apps/worker:      shipped agent composition root (shipped-agents.ts)
```

| Package | May import | Must not import |
| --- | --- | --- |
| `runtime-agent` | local types; `zod` only when Phase 3 adds `agent-ingress.ts` | `runtime-events`, `runtime-adapters`, `runtime-worker`, `agents/*`, `adapters/*`, `apps/*` |
| `runtime-adapters` | `zod`, registry types | `agents/*`, `adapters/*`, `apps/*` |
| `runtime-manifest` | `runtime-agent` (`AgentDefinition` type only) | `runtime-events`, `apps/worker/src/shipped-agents`, `apps/adapters/src/shipped-adapters`, any `*/definition` |

**`runtime-manifest` receives `knownEventTypes` from apps; it does not import `runtime-events`.** Worker composes: `knownEventTypes: new Set(Object.keys(eventRegistry))`.

## Dependency rules (unchanged + extended)

```text
agents/*           → runtime-agent, runtime-*, adapter-*/ (contracts only)
agents/*           → MUST NOT import adapter-*/definition, adapter-*/methods, adapter-*/live
adapters/*         → runtime-adapters (defineAdapterSource, defineAdapterMethod)
apps/adapters      → adapter-*/definition (via shipped-adapters.ts only), runtime-adapters, runtime-manifest
apps/worker        → agent-*/definition, runtime-manifest, runtime-worker, runtime-events (for knownEventTypes at load)
apps/ingress       → agent packages for schemas/emit (until Phase 3); then shipped-ingress
libs/runtime-*     → MUST NOT import adapters/*, agents/*, or apps/*
libs/agent-test-harness → MUST NOT import apps/*
```

**New architecture test rules** (`test/architecture/runtime-boundaries.test.ts`):

1. `apps/adapters/**/*.ts` must not import `adapter-gitlab/methods` (path alias removed).
2. `apps/adapters/**/*.ts` may import `adapter-*/definition` only from `shipped-adapters.ts` (enforce: only `shipped-adapters.ts` may import `*/definition`).
3. `agents/**/*.ts` must not import `*/definition`.
4. `libs/runtime-manifest/**/*.ts` must not import `agent-*/definition`, `adapter-*/definition`, or `apps/worker/src/shipped-agents`.
5. `libs/runtime-agent/**/*.ts` must not import `runtime-events`, `runtime-adapters`, or `runtime-worker`.
6. `libs/runtime-manifest/**/*.ts` must not import `runtime-events`.
7. `libs/agent-test-harness/**/*.ts` must not import `apps/worker` or `apps/adapters`.

**Adapter source id regex alignment** (`test/architecture/adapter-source-id-pattern-alignment.test.ts`, create in P1-T4):

- Read `ADAPTER_SOURCE_ID_PATTERN.source` from `libs/runtime-adapters/src/define-adapter-source.ts` and `libs/runtime-agent/src/define-agent.ts` (both export the `RegExp`).
- Assert the two `.source` strings are identical.
- Assert the same table of valid/invalid sample ids passes both patterns (e.g. valid: `synapse.adapters.gitlab.v1`; invalid: `synapse.adapters.gitlab`, `synapse.adapters.foo/bar.v1`).

---

## “How to add” flows (authoritative)

### New adapter source (e.g. Jira)

1. Create `adapters/adapter-jira/` with `contracts.ts`, `schemas.ts`, `live-client.ts`, `fixtures.ts`, `jira-adapter.ts`, `definition.ts`, `index.ts` (contracts default).
2. Implement `export const jiraAdapter = defineAdapterSource({ source: 'synapse.adapters.jira.v1', ... })`.
3. Add **one line** to `apps/adapters/src/shipped-adapters.ts`: `jiraAdapter`.
4. Mount in manifest: `"adapters": [{ "source": "synapse.adapters.jira.v1" }]`.
5. Add root `tsconfig.json` paths: `adapter-jira`, `adapter-jira/definition`, etc.

**Do not edit:** method-registry, live-deps-resolvers, or per-source catalog files — they do not exist after Phase 1.

### New method on existing source

1. Add `defineAdapterMethod` module under `adapters/adapter-gitlab/src/methods/<name>.ts`.
2. Register in `gitlab-adapter.ts` `methods: { ..., newMethod }`.
3. Export params/result schemas from `schemas.ts` if agents need them.

**Do not edit** `apps/adapters` unless shipping a new source.

### New agent

1. Create `agents/agent-foo/src/foo-agent.ts` (handler) + `foo-agent.definition.ts` (`defineAgent`).
2. Export `fooAgent` from `agents/agent-foo/src/definition.ts`; add package.json `"./definition"` export.
3. Add `fooAgent` to `apps/worker/src/shipped-agents.ts`.
4. Mount in manifest: `"agents": [{ "name": "agent-foo" }]`.
5. Mount webhooks/adapters the agent needs.

---

## Implementation plan

### Definition of done (every task)

- Unit tests for `defineAdapterSource` / `buildShippedAdapterRuntime` and `defineAgent` **shape** validation only; event-type registry membership tested in `runtime-manifest` load tests, not in `runtime-agent`.
- Integration tests updated for manifest load without handler paths (Phase 2).
- Architecture tests extended as specified.
- `npx nx run-many -t lint --all && npx biome check biome.json vitest.config.ts`
- `npx nx run-many -t typecheck --all`
- `npx nx run-many -t test --all && npm run test:docs`
- Dev smoke: `npm run dev -- --manifest manifests/examples/echo.json` + `npm run dev:once -- --fixture example/echo`
- Relevant README updates: `adapters/adapter-gitlab/README.md`, `apps/adapters/README.md`, `apps/worker/README.md`, `.cursor/rules/adapter-runtime-boundaries.mdc`

### Task graph

```text
P1-T1 defineAdapterSource + buildShippedAdapterRuntime
  → P1-T2 gitlabAdapter + shipped-adapters
  → P1-T3 delete old apps/adapters registries + fix invoke
  → P1-T4 tests + architecture

P2-T1 defineAgent + example/agent definitions
  → P2-T2 shipped-agents + loadValidatedManifestRegistry
  → P2-T3 manifest JSON + schema migration
  → P2-T4 delete handler-path + resolve-handler
  → P2-T5 harness + worker tests

P3 (deferred) shipped-ingress
```

### P1-T1: Generic adapter source builder

**Create:**

- `libs/runtime-adapters/src/define-adapter-source.ts`
- `libs/runtime-adapters/src/shipped-adapter-catalog.ts`
- `libs/runtime-adapters/src/build-shipped-adapter-runtime.ts`

**Modify:**

- `libs/runtime-adapters/src/index.ts` — export new symbols

**Tests:** `libs/runtime-adapters/test/unit/define-adapter-source.test.ts`, `build-shipped-adapter-runtime.test.ts`

- Invalid source id throws
- Method source mismatch throws
- Duplicate registration throws
- `createLiveDeps` omits undefined sources; live invoke without deps key returns `adapter_live_deps_missing`
- Catalog lists methods per source

### P1-T2: GitLab `defineAdapterSource`

**Create:** `adapters/adapter-gitlab/src/gitlab-adapter.ts`, `definition.ts`

**Modify:** `package.json` exports, `tsconfig.json` paths, delete `methods.ts`

**Delete imports of** `adapter-gitlab/methods` across repo (grep)

### P1-T3: `apps/adapters` wiring

**Create:** `shipped-adapters.ts`, `shipped-adapter-runtime.ts`

**Modify:** `app.ts`, `invoke/execute-adapter-invoke.ts`, any file importing old registry/catalog

**Delete:** `method-registry.ts`, `live-deps.ts`, `live-deps-resolvers.ts`, `adapter-source-catalog.ts`

### P1-T4: Phase 1 verification

- Update `test/architecture/runtime-boundaries.test.ts`
- Create `test/architecture/adapter-source-id-pattern-alignment.test.ts` (regex `.source` equality + shared valid/invalid table)
- Assert `apps/adapters/src/invoke/**/*.ts` contains no `as Gitlab` / vendor-specific live-deps casts (regex or architecture rule)
- Update `.cursor/rules/adapter-runtime-boundaries.mdc` “add adapter” section to match this spec
- Run full Nx verification + echo dev smoke

### P2-T1: `defineAgent` + definitions

**Create:** `libs/runtime-agent/src/define-agent.ts`, all `*-agent.definition.ts` + `definition.ts` barrels

**Do not create in Phase 2:** `libs/runtime-agent/src/agent-ingress.ts` (Phase 3)

**Tests:** `libs/runtime-agent/test/unit/define-agent.test.ts`

- Invalid name / handle / usesAdapters pattern throws (including hyphenated handles like `pr.received.v1`, rejection of unversioned `pr.received`)
- Valid definition returns unchanged
- **No** test importing `runtime-events` or `runtime-worker`

**Modify:** each agent `package.json` exports, `tsconfig.json` paths

### P2-T2: Worker shipped agents

**Create:** `apps/worker/src/shipped-agents.ts`

**Modify:** `manifest-registry.ts`, `agent-test-harness` — require `shippedAgents` on `startTestDevServer` / `withTestDevServer`; update every harness caller to pass `shippedAgentsByName` from `apps/worker`

**Do not create:** `libs/agent-test-harness/src/default-shipped-agents.ts`

### P2-T3: Manifest schema and JSON

**Modify:** `runtimeManifestAgentSchema`, `schemas/manifest/runtime.v1.schema.json`, all manifests under `manifests/`

**Modify:** `validate.ts` — remove handler path validation; add `usesAdapters` mount validation

### P2-T4: Remove dynamic handler loading

**Delete:** `resolve-handler.ts`, `handler-path.ts`, related tests

**Modify:** `registry.ts` — `createRuntimeRegistryFromManifest` keys handlers by agent name:

```ts
const handler = input.handlers.get(agent.name);
```

(not `agent.handler`).

### P2-T5: Phase 2 verification

- Update `libs/runtime-manifest/test/integration/registry.integration.test.ts`
- Scenario tests still pass for `review-pr/gitlab-synapse`
- Application manifest smoke (manual or CI job) with `AGENT_REVIEWER_HERMETIC=1` optional — **not** required for default echo smoke

---

## Verification matrix

| Check | Command / test | Pass criteria |
| --- | --- | --- |
| Unit: adapter builder | `npx nx run runtime-adapters:test` | All new builder/validation tests green |
| Unit: GitLab adapter | `npx nx run adapter-gitlab:test` | Existing tests pass; no import from deleted `methods` barrel |
| Unit: adapters app | `npx nx run adapters:test` | Invoke + scenario tests pass without resolvers |
| Architecture | `npm run test:docs` | Boundary tests include definition-import rules |
| Registry sync | `apps/adapters/test` (existing catalog test) | `SHIPPED_ADAPTER_SOURCES` matches `gitlabAdapter.methods` keys |
| Cross-process FIFO | existing integration tests | Unchanged behavior |
| Manifest load | `runtime-manifest` integration test | Loads `example-echo` manifest with name-only agent |
| Worker registry | `apps/worker/test` | `loadValidatedManifestRegistry` receives `shippedAgents` |
| Dev echo smoke | `npm run dev -- --manifest manifests/examples/echo.json` + `dev:once -- --fixture example/echo` | Snapshot: `example-echo` succeeded, event chain intact |
| Review PR scenario | `dev:once -- --fixture review-pr/gitlab-synapse` with application manifest + hermetic reviewer | Adapter FIFO + agent run succeeded (manual QA checklist) |

### Regression tests to add

1. **`buildShippedAdapterRuntime`** — two methods on one source share same `createLiveDeps` object shape.
2. **`loadValidatedManifestRegistry`** — manifest agent name not in `shippedAgents` throws clear error.
3. **Architecture** — `contracts.ts` still must not import `defineAdapterMethod` or `methods/`.
4. **`adapter-source-id-pattern-alignment`** — `ADAPTER_SOURCE_ID_PATTERN.source` identical in `runtime-adapters` and `runtime-agent`.
5. **Architecture** — `apps/adapters/src/invoke/**` has no vendor-specific `liveDeps` casts.

---

## Adjacent simplifications (explicit)

| Area | Before | After Phase 1 | After Phase 2 |
| --- | --- | --- | --- |
| `apps/adapters` file count for GitLab | 4 registration files | 2 (`shipped-adapters`, `shipped-adapter-runtime`) | same |
| Adding adapter method | 2+ files | 1 file in adapter package | same |
| Adding adapter source | 5+ touch points | 2 (package + shipped-adapters) | same |
| Manifest agent entry | 3 fields | 3 fields (unchanged) | 1 field (`name`) |
| Handler allowlist env | `SYNAPSE_ALLOW_LOCAL_MANIFEST_IMPORTS` | unchanged | **removed** with handler-path |
| `agent-test-harness` | dynamic import via manifest path | unchanged | explicit `shippedAgents` param from caller (no lib → app import) |
| Ingress | per-route files | unchanged | Phase 3: generic mount |
| `runtime-manifest` webhook catalog | central list | unchanged | Phase 3: derive from agents |

---

## Non-goals

1. **No `apps/platform` or `libs/product-registry`** in this spec.
2. **No shared adapter instances** across processes.
3. **No `class MyAdapter`** OOP hierarchy — only `defineAdapterSource` records.
4. **No Phase 3 ingress migration** in shipped scope.
5. **No new vendor adapters** beyond refactoring GitLab (Jira is documentation example only).
6. **No change** to adapter HTTP route shape `/v1/adapters/:source/:method` or scenario FIFO semantics.
7. **No change** to `ctx.adapters` worker client or `.synapse/active-scenario-run.json` protocol.
8. **No manifest version bump to 2** — stay on `"version": 1` with a breaking agent entry shape change documented in Phase 2 release notes inside this repo only.
9. **No `libs/runtime-ids` package in shipped scope** — adapter source id regex is duplicated in `runtime-agent` with an alignment comment; extract to `runtime-ids` only if a third consumer appears.

---

## Core contract summary

```text
runtime-adapters: generic adapter source/method primitives.
runtime-agent: generic agent definition primitive (no product registry imports).
runtime-manifest: validates mounted definitions passed in by apps.
defineAdapterSource in adapters/* owns source id, methods, schemas, and createLiveDeps.
shippedAdapters in apps/adapters derives registry, catalog, and live deps.
defineAgent in agents/* owns name, handles, run, and usesAdapters.
shippedAgents in apps/worker resolves manifest agent names.
Manifest mounts names and sources only; cannot override handles.
apps/adapters executes adapter RPC; worker executes agents; ingress stays separate until Phase 3.
Definitions ship; instances stay in-process per app.
```

---

## Relationship to `specs/adapters.md`

| Topic | `specs/adapters.md` | This spec |
| --- | --- | --- |
| RPC protocol, FIFO, headers | Authoritative | Unchanged |
| `defineAdapterMethod` | Authoritative | Used inside `defineAdapterSource.methods` |
| `apps/adapters` composition root | Authoritative | Narrowed to **one** shipped list |
| Agent `ctx.adapters` | Authoritative | Unchanged |
| Manifest adapter mounts | Authoritative | Unchanged |

Implement **this spec after** adapter RPC baseline is merged. Phase 1 can land as a focused PR; Phase 2 as a second PR with manifest breaking change called out in PR description.
