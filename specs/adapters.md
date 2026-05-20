# Adapter RPC Service — Full Spec

## Status

Architecture: approved for implementation.

The adapter system should feel like this:

```text
Decide if the capability is adapter-eligible (bounded request/response JSON IO).
If yes: add one method module under adapters/, document boundary, register in apps/adapters.
Scenarios mock it via adapters[] and apps/adapters FIFO.
Agents call it through ctx.adapters only.

If no (streaming, sessions, agent control loop): keep an in-process agent dependency;
fake it with injection in tests — not scenario.adapters[].
```

---

## Goal

Introduce a small **Adapter RPC service** (`apps/adapters`) that provides one global adapter invocation boundary for Synapse.

The primary reason for this service is **global adapter state**:

```text
apps/ingress and apps/worker are separate Node processes.
Importing the same adapter class into both does not create one shared instance.
To share FIFO scenario adapter state across ingress and worker, adapter calls must go through one running service.
```

The adapter service owns:

* live adapter method execution;
* scenario adapter fixture queues, global per `scenarioRunId`;
* adapter `source` / `method` / `params` / `result` validation;
* FIFO consumption for scenario mocks;
* adapter-call observability.

It does not own:

* agent policy;
* `ctx.emit`;
* poll interval scheduling;
* scenario file parsing;
* `dev:once` CLI orchestration;
* runtime worker planning.

Architecture slogan:

```text
Agents decide why.
Adapters know how (bounded IO through apps/adapters).
In-process dependencies own interactive orchestration inside the worker/agent process.
```

**Boundary rule (authoritative):**

```text
Out-of-process Adapter RPC = bounded JSON request/response IO via apps/adapters,
  plus scenario FIFO, cross-process consistency, and centralized secrets for mounted sources.

In-process agent dependency = constructed or imported inside the worker/agent process
  (direct import, agent factory, or test injection); not scenario.adapters[]; may stream or hold sessions.
```

**Terminology:** *In-process agent dependency* includes libraries injected at agent construction or wired by the worker in tests — not only code physically under `agents/*`.

Not every external-facing or reusable capability belongs in `apps/adapters`. See [Adapter boundary and eligibility](#adapter-boundary-and-eligibility).

---

## Core design decision: method-owned adapter registration

The spec should not use two independent registries like this:

```text
one module says synapse.adapters.gitlab.v1.fetchChanges exists
a second registry separately implements the same method
```

That shape is easy to understand, but it creates drift. Someone can update one registry and forget the other.

Instead, each adapter method is a single exported module:

```text
adapters/adapter-gitlab/src/methods/fetch-changes.ts
  owns:
    source: 'synapse.adapters.gitlab.v1'
    method: 'fetchChanges'
    paramsSchema
    resultSchema
    live invoke implementation
```

Then `apps/adapters` imports method modules into one runtime registry.

This gives a single source of truth per method while preserving a central registry at runtime.

Only methods that pass [Adapter boundary and eligibility](#adapter-boundary-and-eligibility) are registered in `apps/adapters/src/method-registry.ts`.

---

## Adapter boundary and eligibility

Adapter RPC is intentionally a **bounded request/response boundary**. It is not a general plugin system, streaming runtime, tool runtime, or agent orchestration framework.

### Architectural rule

```text
Out-of-process Adapter RPC: bounded request/response IO whose params and result are JSON-safe
and whose scenario behavior is modeled as FIFO fixtures in apps/adapters.

In-process agent dependency: interactive, streaming, stateful, or algorithmic capabilities
that are part of the agent’s control loop; faked through tests/factories, not scenario.adapters[].
```

If an in-process dependency later needs remote streaming, pooling, or process isolation, that is a **future runtime-service design** — not Adapter RPC v1. Do not introduce a third primary category in v1 docs or checklists.

**Practical API test:**

```text
If the natural API is:  await fn(params): result     → may be an adapter.
If the natural API is:  for await (...), callbacks, subscriptions, sessions,
                        cancellation, or multi-step interaction → not an adapter in v1.
```

### When to make an adapter method

A capability should become an **adapter RPC method** when **most** of these are true:

| Question | Adapter if yes |
| --- | --- |
| Does it perform external IO? | Usually yes |
| Does it need scenario fixture substitution via `apps/adapters` FIFO? | Strong yes |
| Does it need shared FIFO state across ingress and worker? | Strong yes |
| Do ingress and worker both need to call it consistently? | Strong yes |
| Is it a coarse, request/response operation? | Strong yes |
| Can input and output be bounded JSON-safe values? | Strong yes |
| Should agents be isolated from secrets and vendor SDKs? | Strong yes |
| Is it useful across multiple agents? | Often yes |

### When to keep an in-process agent dependency

A capability should stay **in-process** (imported or injected in the worker/agent process, not `ctx.adapters`) when **most** of these are true:

| Question | In-process if yes |
| --- | --- |
| Is it highly interactive or streaming? | Strong yes |
| Does it expose callbacks, async iterators, event emitters, or long-lived sessions? | Strong yes |
| Is it part of the agent’s internal reasoning or control loop? | Strong yes |
| Does it not need global FIFO scenario state in `apps/adapters`? | Strong yes |
| Is it tightly coupled to one agent’s algorithm? | Strong yes |
| Would one RPC call require fake batching or hidden sessions? | Strong yes |
| Is testing better via injected fakes than FIFO fixtures? | Strong yes |

### Two capability categories (v1)

| Category | Shape | v1 treatment |
| --- | --- | --- |
| **Out-of-process Adapter RPC method** | `ctx.adapters` → `apps/adapters` → JSON result | Scenario FIFO via `scenario.adapters[]` and `POST /v1/dev/scenario-runs` |
| **In-process agent dependency** | Direct import or injection inside worker/agent process | Faked through tests, agent factories, or worker wiring — **not** `scenario.adapters[]` |

Examples: `gitlab.fetchChanges` → Adapter RPC. `libs/pi-harness` interactive review → in-process. Deferred adapters: `jira.searchIssues`, `slack.postWebhook` (when checklist passes).

### Classification examples

| Capability | Classification | Reason |
| --- | --- | --- |
| GitLab `fetchChanges` | Adapter RPC | Bounded external IO; JSON params/result; FIFO fixtures; ingress/worker consistency |
| Jira `searchIssues` | Adapter RPC (when shipped) | Coarse search; fixtureable; may be used from poll ingress and worker |
| Slack `postWebhook` | Adapter RPC (when shipped) | Bounded side effect; centralized secrets |
| Pi harness interactive review | **In-process** (`libs/pi-harness`) | Streaming/interactive; FIFO RPC is a poor fit |
| Agent scoring heuristic | In-process | Pure algorithm; no adapter boundary |
| Markdown diff summarizer | In-process unless remote service-backed | No global adapter FIFO unless promoted to Adapter RPC |
| One-shot LLM completion | Adapter RPC **only if** truly bounded JSON in/out | Streaming agent loop stays in-process in v1 |

### Pi harness (explicit v1 decision)

**`libs/pi-harness` is not an Adapter RPC method in v1.** It is not mounted as `synapse.adapters.pi-review.v1` and does not appear in scenario `adapters[]` for new specs.

Natural Pi APIs look like:

```ts
for await (const event of piHarness.reviewStream(input)) {
  // agent reacts incrementally
}
```

—not `await ctx.adapters.invoke({ source: 'pi-review', method: 'review', params })`.

Forcing Pi through `apps/adapters` would invite bad designs: fake batch results, ad-hoc streaming on the adapter service, or `runSession` as a hidden remote app. Those violate the simplicity goal.

**Curriculum testing for Pi:** inject `PiHarnessPort` fakes at agent construction or via worker test harness — not `apps/adapters` scenario FIFO. GitLab MR fetch **does** use adapter FIFO in the canonical `review-pr/gitlab-synapse` example.

If Pi later needs process isolation, that is a future runtime-service spec — not Adapter RPC v1.

### Adapter RPC v1 non-goals (streaming and sessions)

Adapter RPC v1 does **not** support:

* streaming responses (SSE, chunked partial results);
* bidirectional sessions;
* callbacks or subscriptions from the adapter service to the agent;
* server-pushed partial results;
* cancellation protocols beyond HTTP client abort;
* WebSocket adapter protocols.

Capabilities that need those semantics remain **in-process** in v1 — not adapter methods.

### Adapter decision checklist (required for new methods)

Before adding a method to `apps/adapters`, answer:

```text
1. Is the natural API a single async request/response?
2. Are params and result bounded JSON-safe values?
3. Does scenario behavior fit FIFO fixtures (source + method + params -> returns)?
4. Is there a need for shared behavior across ingress and worker?
5. Does it require centralized secrets or vendor client setup?
6. Would direct agent import duplicate credentials, state, or inconsistent mocks?
7. Would wrapping it as an adapter hide streaming, session, or control-flow semantics?
```

Decision:

```text
Mostly yes on 1–6 and no on 7  → adapter method (+ manifest mount + README).
7 is yes                         → in-process agent dependency (not adapter v1).
No external/shared state         → in-process dependency.
Remote streaming/session later   → future runtime-service design (out of v1 scope).
```

New adapter PRs must include completed checklist answers in the PR description or method README.

### What lives in `apps/adapters` vs what agents instantiate

| Lives in `apps/adapters` | Instantiated inside agent (or `libs/*`) |
| --- | --- |
| Method registry for **eligible** adapter methods only | `libs/pi-harness`, prompt builders, planners, parsers |
| Live vendor clients and secrets for **mounted** adapter sources | `PiHarnessPort` fakes in tests |
| Global per-`scenarioRunId` FIFO queues | Handler-local orchestration loops |
| `invokeLive` for bounded IO | `for await`, callbacks, multi-step review flows |
| HTTP `/v1/adapters/{source}/{method}` | No `ctx.adapters` for in-process dependencies |

Agents call **`ctx.adapters` / `invokeAdapter` only for adapter-eligible operations**. In-process dependencies are constructed via agent factories or worker/test wiring (prefer `createXAgent(deps)` over bloating `AgentContext`).

**Do not add every local dependency to `AgentContext`.** Only adapter RPC belongs on `ctx.adapters` in v1.

Example (agent-reviewer target shape):

```ts
export function createReviewPrAgent(deps: {
  piHarness: PiHarnessPort;
}) {
  return defineAgentHandler(schema, async (ctx, event) => {
    const changes = await invokeAdapter(ctx.adapters, {
      agentName: ctx.agentName,
      source: 'synapse.adapters.gitlab.v1',
      method: 'fetchChanges',
      params: { projectId, mergeRequestIid },
    });

    for await (const chunk of deps.piHarness.reviewStream({ changes, event })) {
      // agent reacts — not an adapter call
    }
  });
}

// Tests / hermetic scenarios:
createReviewPrAgent({ piHarness: fakePiHarness });
```

### In-process dependencies and scenarios

In-process agent dependencies are **not** mocked via `scenario.adapters[]` or `apps/adapters` FIFO.

| Concern | Adapter RPC | In-process agent dependency |
| --- | --- | --- |
| Scenario mocking | `adapters[]` + `POST /v1/dev/scenario-runs` | Injected fake, env flag, or test-only factory |
| Cross-process FIFO | Yes | No |
| Manifest mount | `manifest.adapters[]` | None |

**Fixture path convention:** only files under `fixtures/<owner>/adapters/` are intended for `scenario.adapters[]`. In-process fakes use other paths (e.g. `fixtures/agent-reviewer/pi-harness/`).

Document how each in-process IO/harness library is faked (see [Documentation requirements](#documentation-requirements)).

---

## High-level process model

```text
             dev:once
                |
                | resolves scenario adapters[].returns
                | installs scenario run
                v
          apps/adapters  <-------------------------+
          POST /v1/adapters/{source}/{method}       |
             ^                                     |
             | HTTP                                |
             |                                     |
 apps/ingress -------------------- ctx.emit ----> Postgres events
             |                                     |
             |                                     v
             +------------------------------ apps/worker
                                              handler -> ctx.adapters -> HTTP
```

Both `apps/ingress` and `apps/worker` call `apps/adapters` over HTTP.

There is no shared JavaScript object heap across processes.

---

## Package layout

### Repository folders

```text
libs/runtime-*     Runtime platform (manifest, worker, events, runtime-adapters contract, dev-once, …)
adapters/*         Adapter-eligible packages only (bounded IO + defineAdapterMethod modules)
libs/pi-harness    Agent-local interactive harness (not under adapters/; not Adapter RPC v1)
apps/adapters      Runnable adapter RPC process (imports adapters/*, exposes HTTP)
agents/*           Business capability; calls apps/adapters via runtime-adapters client only
```

**`adapters/` is top-level**, not under `libs/`. `libs/` stays runtime-oriented. **Adapter-eligible** families that talk to GitLab, Jira, Slack, etc. live under `adapters/`. Streaming or interactive libraries such as `libs/pi-harness` stay outside `adapters/`.

| Prefix | Role |
| --- | --- |
| `adapters/adapter-<vendor>/` | One package per **adapter-eligible** family (e.g. `adapters/adapter-gitlab` only when checklist passes) |
| `libs/runtime-adapters` | Serializable invoke contract, HTTP client, scenario FIFO primitives (no vendor SDKs) |
| `apps/adapters` | Single process that executes all adapter calls |

Root `package.json` workspaces must include `"adapters/*"` (alongside `agents/*`, `apps/*`, `libs/*`). Package **names** stay unscoped (`adapter-gitlab`, …). Only **adapter-eligible** packages live under `adapters/`.

**Migration:** `libs/adapter-gitlab` → `adapters/adapter-gitlab`. **`libs/pi-harness` stays in `libs/`** — not moved to `adapters/` and not registered in `apps/adapters` for v1.

---

### `libs/runtime-adapters`

Shared runtime contract package.

```text
libs/runtime-adapters/src/define-adapter-method.ts
libs/runtime-adapters/src/types.ts
libs/runtime-adapters/src/client.ts
libs/runtime-adapters/src/registry.ts
libs/runtime-adapters/src/scenario-queue.ts
libs/runtime-adapters/src/stable-json.ts
libs/runtime-adapters/src/headers.ts
libs/runtime-adapters/src/index.ts
```

Owns:

* `defineAdapterMethod(...)`;
* `AdapterMethodDefinition`;
* `AdapterPort`;
* `createAdapterHttpClient(...)`;
* `invokeAdapter(...)`;
* stable structural params matching;
* scenario FIFO queue primitives;
* shared headers such as `X-Synapse-Scenario-Run-Id`.

Must not import:

* `apps/*`;
* live vendor clients;
* scenario file loaders;
* agent packages.

### `adapters/*`

Packages for **adapter-eligible** bounded IO only (not every external or reusable library). Each package must pass the [adapter decision checklist](#adapter-decision-checklist-required-for-new-methods) and ship `adapters/adapter-<family>/README.md`.

Example:

```text
adapters/adapter-gitlab/src/methods/fetch-changes.ts
adapters/adapter-gitlab/src/client.ts
adapters/adapter-gitlab/src/index.ts
adapters/adapter-gitlab/README.md
```

Owns:

* vendor HTTP / SDK code;
* method modules via `defineAdapterMethod`;
* params/result schemas for those methods;
* live implementation for those methods.

Must not:

* emit Synapse events;
* import agents;
* parse scenario files;
* know about `dev:once`;
* know about worker planning.

### `apps/adapters`

Runnable adapter RPC service.

```text
apps/adapters/src/main.ts
apps/adapters/src/app.ts
apps/adapters/src/env.ts
apps/adapters/src/method-registry.ts
apps/adapters/src/routes/invoke.ts
apps/adapters/src/routes/dev-scenario-runs.ts
apps/adapters/src/scenario/scenario-run-store.ts
apps/adapters/src/scenario/scenario-adapter-resolver.ts
apps/adapters/src/observability.ts
```

Owns:

* HTTP API;
* scenario run store;
* global FIFO queues;
* runtime method registry assembled from method modules;
* **active manifest adapter mounts** (`SYNAPSE_RUNTIME_MANIFEST` → which sources accept invokes);
* live invocation routing;
* adapter observability.

Must not:

* emit events;
* parse scenario files from disk;
* list or validate scenario ids (that stays in `libs/dev-once` / `libs/synapse-scenarios`);
* run worker planning;
* call agents.

### Existing packages to modify

| Package                  | Change                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `libs/runtime-agent`     | Extend `AgentContext` with `adapters: AdapterPort`                                             |
| `libs/runtime-worker`    | Create and inject adapter HTTP client into agent contexts                                      |
| `apps/ingress`           | Use adapter HTTP client for ingress-time adapter calls and poll registrars                     |
| `libs/dev-once`          | Install/delete scenario runs on `apps/adapters`                                                |
| `libs/runtime-manifest`  | `adapters[]` mounts, `ADAPTER_SOURCE_CATALOG`, scenario-vs-manifest adapter validation       |
| `libs/synapse-scenarios` | Continue resolving `{ file }` / `{ data }`; stop owning runtime adapter queues after migration |
| `adapters/*`             | Move from `libs/adapter-*`; method modules + vendor clients only                             |
| `agents/*`               | Call `ctx.adapters`; no direct `adapters/*` imports in migrated handlers                     |

---

## Dependency rules

```text
apps/adapters may import:
  runtime-adapters
  adapters/*
  runtime-config
  runtime-observability

adapters/* may import:
  runtime-adapters
  runtime-config / runtime-observability (where useful)

runtime-adapters must not import:
  adapters/*
  apps/*
  agents/*

apps/worker and apps/ingress runtime code:
  runtime-adapters client only
  not adapters/* directly

agents/* handler modules (shipped runtime):
  runtime-agent, runtime-events
  runtime-adapters types only through ctx.adapters
  not adapters/* directly

libs/pi-harness must not be imported by apps/adapters.
```

Unit tests may import anything for fakes. These rules apply to **shipped runtime** code paths.

---

## Adapter method definition

### `defineAdapterMethod`

Each adapter method is registered by one module.

```ts
import { defineAdapterMethod } from 'runtime-adapters';
import { z } from 'zod';

const paramsSchema = z.object({
  projectId: z.number().int().positive(),
  mergeRequestIid: z.number().int().positive(),
}).strict();

const resultSchema = z.object({
  project_id: z.number().int().positive(),
  merge_request_iid: z.number().int().positive(),
  changes: z.array(z.unknown()),
}).strict();

export const gitlabFetchChangesMethod = defineAdapterMethod({
  source: 'synapse.adapters.gitlab.v1',
  method: 'fetchChanges',
  description: 'Fetch GitLab merge request changes.',
  boundary: {
    reason:
      'Bounded GitLab IO; centralized credentials; FIFO scenario fixtures; may be called from worker (and ingress if needed).',
    scenarioFixtureable: true,
    sharedAcrossProcesses: true,
  },
  paramsSchema,
  resultSchema,
  invokeLive: async (params, deps) => {
    return deps.gitlabClient.fetchChanges(params);
  },
});
```

### Required fields

```ts
export type AdapterMethodBoundary = {
  reason: string;
  scenarioFixtureable: boolean;
  sharedAcrossProcesses: boolean;
};

export type AdapterMethodDefinition<Params, Result, Deps = unknown> = {
  source: string;
  method: string;
  description: string;
  boundary: AdapterMethodBoundary;
  paramsSchema: z.ZodType<Params>;
  resultSchema: z.ZodType<Result>;
  invokeLive: (params: Params, deps: Deps) => Promise<Result>;
};
```

`boundary` is required documentation for [why it is an adapter](#adapter-boundary-and-eligibility). Enforcement is primarily architectural review, README, import rules, and the [adapter decision checklist](#adapter-decision-checklist-required-for-new-methods) — not runtime checks on `requestResponse` flags.

### Rules

* `source` is a **versioned catalog id** (see [Adapter source ids](#adapter-source-ids)), e.g. `synapse.adapters.gitlab.v1`, not a bare vendor name like `gitlab`.
* `method` is a coarse-grained operation, e.g. `fetchChanges`, `searchIssues`, `postWebhook`.
* Methods that fail the [adapter decision checklist](#adapter-decision-checklist-required-for-new-methods) must not be added to `adapters/*` or `apps/adapters`.
* `paramsSchema` validates every request body.
* `resultSchema` validates every live result and every scenario fixture result.
* `invokeLive` performs vendor IO only. It must not emit events.

---

## Runtime method registry

`apps/adapters` assembles the registry explicitly:

```ts
// apps/adapters/src/method-registry.ts

import { createAdapterMethodRegistry } from 'runtime-adapters';
import { gitlabFetchChangesMethod } from 'adapter-gitlab';

export const adapterMethodRegistry = createAdapterMethodRegistry([
  gitlabFetchChangesMethod,
]);
```

This is the only central list of shipped adapter methods. The registry is **complete** (all method modules in the repo), not filtered by manifest mounts.

**Mount policy is separate:** at invoke time, `apps/adapters` loads `mountedSources` from the active manifest and rejects invokes for catalog sources that are not mounted (`adapter_source_not_mounted`). Unknown sources use `adapter_source_unknown`; mounted source but missing method uses `adapter_method_unknown`.

```ts
const registry = createAdapterMethodRegistry(allMethods);
const mountedSources = loadMountedAdapterSources(manifest);
// invoke: catalog check → mount check → registry lookup → ...
```

### Duplicate protection

`createAdapterMethodRegistry` must fail if two methods register the same `source.method`.

```text
synapse.adapters.gitlab.v1.fetchChanges registered twice -> startup failure
```

---

## Adapter source ids

Adapter `source` values are **stable catalog ids** with an explicit version suffix, parallel to ingress mounts:

| Kind | Example id |
| --- | --- |
| Webhook | `synapse.webhooks.prs.v1` |
| Poll | `synapse.poll.example-in-memory-heartbeat.v1` |
| Adapter | `synapse.adapters.gitlab.v1` |

**Pattern (authoritative):**

```text
synapse.adapters.{family}.v{N}
```

Rules:

* `{family}` is a lowercase slug (`gitlab`, `jira`, `slack`). Do not use `pi-review` — Pi is not an adapter source in v1.
* `v{N}` is the contract version for that adapter family’s methods (start at `v1`).
* Scenario `adapters[].source`, `defineAdapterMethod({ source })`, invoke URLs, and manifest `adapters[].source` all use the **same** catalog id string.
* Bare names (`gitlab`, `jira`) are invalid on the wire after this spec ships.

**Shipped v1 catalog sources:**

| `source` | Methods (v1) |
| --- | --- |
| `synapse.adapters.gitlab.v1` | `fetchChanges` |

**Forbidden for Adapter RPC v1 (not deferred):** Pi harness — use `libs/pi-harness` in-process only. See [Pi harness (explicit v1 decision)](#pi-harness-explicit-v1-decision).

**Deferred** (illustrative; add only after checklist + README): `synapse.adapters.jira.v1` (`searchIssues`), `synapse.adapters.slack.v1` (`postWebhook`).

Invoke path uses the full id (URL-encode the `source` path segment when it contains `.`):

```http
POST /v1/adapters/synapse.adapters.gitlab.v1/fetchChanges
```

---

## Adapter method naming

Methods should be coarse-grained.

Good:

```text
synapse.adapters.gitlab.v1.fetchChanges
synapse.adapters.jira.v1.searchIssues
synapse.adapters.slack.v1.postWebhook
```

Avoid by default:

```text
synapse.adapters.jira.v1.fetchPage
synapse.adapters.jira.v1.nextCursor
synapse.adapters.gitlab.v1.getFile
synapse.adapters.gitlab.v1.getRawDiffLine
```

RPC boundaries punish chatty APIs. Pagination should usually happen inside the live implementation, with params like `maxPages`, `pageSize`, or `query`.

---

## Agent-facing API

### Required base API

Agents call adapters through `ctx.adapters`.

```ts
const changes = await invokeAdapter(ctx.adapters, {
  agentName: ctx.agentName,
  source: 'synapse.adapters.gitlab.v1',
  method: 'fetchChanges',
  params: {
    projectId,
    mergeRequestIid,
  },
});
```

`ctx.adapters` is an `AdapterPort`.

```ts
export type AdapterPort = {
  invoke(input: AdapterInvokeInput): Promise<unknown>;
};
```

`invokeAdapter(...)` is the typed validating helper.

### Optional future sugar

This may be added later, but is not required for v1:

```ts
await ctx.adapters['synapse.adapters.gitlab.v1'].fetchChanges({ projectId, mergeRequestIid });
```

Do not require nested typed facades for the first implementation. Start with one boring `invoke` API.

---

## Serializable params and actionable errors

Adapter RPC requires **JSON-safe** `params` on every invoke. A common failure mode is agents passing values that work in-process but cannot cross HTTP: `undefined` inside objects, `BigInt`, `Date`, functions, class instances, `Map`/`Set`, circular references, or `NaN`/`Infinity`.

Generic `JSON.stringify` failures (`Converting circular structure to JSON`) are not acceptable as the primary developer experience. Validation must be **early**, **structured**, and **blame the caller** (agent handler), not the adapter service or fetch layer.

### Validation pipeline (strict order)

All steps run in `invokeAdapter(...)` on the **caller** before `fetch`, then again on **`apps/adapters`** after JSON parse (defense in depth).

```text
1. Caller: require agentName (from ctx.agentName) on every invoke — for error attribution
2. Caller: assertJsonSerializable(params, path: "params") — fail before Zod if value cannot be JSON-encoded
3. Caller + server: paramsSchema.safeParse(params) — shape and allowed JSON types
4. Caller: JSON.stringify({ params: parsed }) in try/catch — last resort; should not throw if step 2 passed
5. HTTP POST
6. Server: parse JSON body — adapter_body_invalid_json if malformed
7. Server: repeat steps 2–3 on parsed body
8. Server: scenario FIFO or invokeLive → resultSchema → assertJsonSerializable(result, "result")
```

Caller and server ordering should match [Invoke behavior](#invoke-behavior). Step 2 (serializability) must run **before** Zod so errors distinguish “not JSON-safe” from “wrong shape”.

### JSON-safe value rules (authoritative)

Allowed in `params` (and in scenario `adapters[].params` / `returns` after resolution):

| Allowed | Notes |
| --- | --- |
| `string`, `boolean`, `null` | As usual |
| finite `number` | Reject `NaN`, `Infinity`, `-Infinity` with `adapter_params_not_serializable` |
| plain objects | Own enumerable data only; reject class instances |
| arrays | Elements must be JSON-safe recursively |

Rejected (non-exhaustive; implement `assertJsonSerializable` to walk the tree):

| Value | `valueKind` | Typical fix |
| --- | --- | --- |
| `undefined` (including inside objects) | `undefined` | Omit key or use `null` |
| `bigint` | `bigint` | `Number(x)` if safe, else string |
| `function` | `function` | Do not pass callbacks; compute before invoke |
| `symbol` | `symbol` | Remove or stringify |
| `Date` | `date` | `date.toISOString()` |
| `Map`, `Set`, typed arrays as opaque objects | `unsupported_object` | Convert to plain array/object |
| Circular reference | `circular` | Build a plain DTO |
| Class instance | `class_instance` | Map to plain object with explicit fields |

Use **dot paths** for nesting: `params.items[2].metadata`, `params.callback`.

### Error codes (params family)

Separate serializability from schema failures:

| Code | When | Who fixes |
| --- | --- | --- |
| `adapter_params_not_serializable` | Step 2 or `JSON.stringify` on caller | Agent handler (build plain params) |
| `adapter_params_invalid` | Zod `paramsSchema` failed | Agent handler or method contract |
| `adapter_body_invalid_json` | HTTP body not JSON | Client bug or proxy corruption |
| `adapter_request_invalid` | Missing `params` key when required, wrong top-level shape | Caller |

Do not map serializability failures to `adapter_params_invalid` or generic `500` text.

### Error response shape (authoritative)

Every adapter invoke error returned to callers (and thrown as `AdapterInvokeError` in-process) uses:

```json
{
  "error": {
    "code": "adapter_params_not_serializable",
    "message": "Adapter params for synapse.adapters.gitlab.v1.fetchChanges are not JSON-serializable: params.diffMetadata is undefined. Adapter RPC accepts JSON-safe data only (string, number, boolean, null, plain objects, arrays). Omit optional fields or use null.",
    "source": "synapse.adapters.gitlab.v1",
    "method": "fetchChanges",
    "agentName": "agent-reviewer",
    "fieldPath": "params.diffMetadata",
    "valueKind": "undefined",
    "hint": "Omit the key or set null. undefined is stripped by JSON and breaks scenario fixture matching.",
    "callerAction": "Fix the agent handler that built these params before calling ctx.adapters / invokeAdapter."
  }
}
```

Rules:

* **`message`** — one sentence a human reads first; includes `source.method`, `fieldPath`, and `valueKind`.
* **`agentName`** — required on invoke input; copied into errors so worker logs and `dev:once` artifacts identify the handler.
* **`fieldPath`** — always present for param errors; `"params"` for root-level issues.
* **`valueKind`** — machine-stable category for docs and tests.
* **`hint`** — one concrete remediation (not a link to RFC 8259).
* **`callerAction`** — always states that the **agent handler** (or ingress registrar) must change, not `apps/adapters`.
* **No stack traces in HTTP JSON** — keep stacks in worker/ingress logs via thrown `AdapterInvokeError.cause`.

Zod failures use the same envelope with `code: adapter_params_invalid` and Zod’s path joined into `fieldPath` (e.g. `params.projectId`):

```json
{
  "error": {
    "code": "adapter_params_invalid",
    "message": "Invalid params for synapse.adapters.gitlab.v1.fetchChanges: params.projectId must be a positive integer.",
    "source": "synapse.adapters.gitlab.v1",
    "method": "fetchChanges",
    "agentName": "agent-reviewer",
    "fieldPath": "params.projectId",
    "zodIssue": "too_small",
    "hint": "Pass projectId as a number, not a string.",
    "callerAction": "Fix the agent handler that built these params before calling invokeAdapter."
  }
}
```

### `invokeAdapter` contract

```ts
export type AdapterInvokeInput = {
  source: AdapterSourceId;
  method: string;
  /** Optional on input; normalized to {} before serialize, parse, and fixture match. */
  params?: Record<string, unknown>;
  /** Required — copied into errors and structured logs. */
  agentName: string;
  scenarioRunId?: string;
};

export class AdapterInvokeError extends Error {
  readonly code: string;
  readonly details: AdapterErrorBody['error'];
  constructor(details: AdapterErrorBody['error'], options?: { cause?: unknown });
}

export async function invokeAdapter(
  port: AdapterPort,
  input: AdapterInvokeInput,
): Promise<unknown> {
  // assertJsonSerializable → safeParse → port.invoke → map HTTP error JSON to AdapterInvokeError
}
```

Caller-side failures throw `AdapterInvokeError` **before** HTTP so local dev shows the agent stack, not a generic fetch error.

`createAdapterHttpClient` must parse error JSON bodies and throw `AdapterInvokeError` with the server `error` object unchanged.

### Implementation location

| Function | Package |
| --- | --- |
| `assertJsonSerializable(value, path)` | `libs/runtime-adapters` |
| `formatAdapterParamError(...)` | `libs/runtime-adapters` |
| `invokeAdapter` | `libs/runtime-adapters` |
| HTTP error mapping | `libs/runtime-adapters/src/client.ts` |
| Server-side re-validation | `apps/adapters/src/routes/invoke.ts` |

### Logging and surfacing

When `invokeAdapter` throws in the worker:

* Log with `buildRuntimeLogFields`: `agentName`, `source`, `method`, `error.code`, `fieldPath`, `valueKind`, `run.id`, `input.type` (event type).
* Span `adapter.request` status = error with same attributes (no raw params payload).
* Agent run `lastError` should store **`error.message` + `error.code`** from `AdapterInvokeError`, not `"fetch failed"` or `TypeError` from `JSON.stringify`.

Ingress registrars pass `agentName` from poll catalog **owner agent** when calling adapters.

### Zod schema discipline

Method `paramsSchema` must:

* use `.strict()` on objects (reject unknown keys with `adapter_params_invalid`, not silent strip);
* avoid `z.any()`, `z.unknown()` on params roots, and `z.custom()` that admits non-JSON types;
* prefer explicit fields over passing through `event.data` wholesale — if an agent needs `invokeAdapter(..., { params: event.data })`, that is a smell; map fields explicitly in the handler.

Document each method’s allowed params in the method module next to `defineAdapterMethod`.

### Scenario file parity

`dev:once` resolves scenario `adapters[].params` and `returns` to JSON before install. **`POST /v1/dev/scenario-runs` performs required validation** (see [Install validation](#install-validation-required-atomic)). `dev:once` should fail fast on install errors with `scenarioId` and fixture index — not at first handler invoke.

Optional: `libs/synapse-scenarios/files` may pre-validate the same rules when loading scenario files for `--list` ergonomics.

### Tests (required)

| Case | Expect |
| --- | --- |
| `params: { id: 1n }` | `adapter_params_not_serializable`, `valueKind: bigint`, `agentName` set |
| `params: { x: undefined }` | `fieldPath: params.x`, `valueKind: undefined` |
| circular `params` | `valueKind: circular` |
| `projectId: "202"` (string) | `adapter_params_invalid`, Zod path `params.projectId` |
| HTTP 400 body | Client throws `AdapterInvokeError` with same `code` as body |

### Anti-patterns (agent code)

```ts
// Bad: spreads event.data (may contain extra/non-JSON fields)
await invokeAdapter(ctx.adapters, { ...input, params: event.data });

// Bad: Date and undefined survive until fetch
await invokeAdapter(ctx.adapters, {
  agentName: ctx.agentName,
  source: 'synapse.adapters.gitlab.v1',
  method: 'fetchChanges',
  params: { projectId, mergeRequestIid, seenAt: new Date() },
});

// Good: explicit DTO
await invokeAdapter(ctx.adapters, {
  agentName: ctx.agentName,
  source: 'synapse.adapters.gitlab.v1',
  method: 'fetchChanges',
  params: { projectId, mergeRequestIid },
});
```

---

## `AgentContext` extension

```ts
import type { AdapterPort } from 'runtime-adapters';

export type AgentContext = {
  agentName: string;
  input: SynapseEvent;
  run: { id: string; attempt: number };
  adapters: AdapterPort;
  emit: (/* unchanged */) => Promise<SynapseEvent>;
  db?: AgentSqliteDb;
  requireDb(): AgentSqliteDb;
};
```

Worker creates `ctx.adapters` as an HTTP client backed by `apps/adapters`.

Agent handlers must not branch on live vs fixture. The adapter service decides.

---

## Adapter invoke HTTP API

### Request

```http
POST /v1/adapters/{source}/{method}
Content-Type: application/json
X-Synapse-Scenario-Run-Id: scnrun_abc123
```

Header is optional. When present, scenario fixture resolution is used.

Body:

```json
{
  "params": {
    "projectId": 202,
    "mergeRequestIid": 42
  }
}
```

`params` may be omitted on the wire; callers and server **normalize omitted `params` to `{}`** before schema parse and fixture matching. No-param methods use `z.object({}).strict()`.

### Success response

```json
{
  "result": {
    "project_id": 202,
    "merge_request_iid": 42,
    "changes": []
  }
}
```

### Error response

```json
{
  "error": {
    "code": "adapter_fixture_not_found",
    "message": "No scenario fixture matched synapse.adapters.gitlab.v1.fetchChanges with params {\"projectId\":202,\"mergeRequestIid\":42}",
    "source": "synapse.adapters.gitlab.v1",
    "method": "fetchChanges",
    "scenarioRunId": "scnrun_1730000000000"
  }
}
```

---

## Invoke behavior

Every invoke (live or scenario) follows this order on **`apps/adapters`** after the HTTP body is received:

```text
1. Parse JSON body → adapter_body_invalid_json on failure
2. Normalize params: omitted → {}
3. assertJsonSerializable(params, "params")
4. Validate source exists in ADAPTER_SOURCE_CATALOG → else adapter_source_unknown
5. Validate source is mounted in active manifest → else adapter_source_not_mounted
6. Resolve method from registry → else adapter_method_unknown
7. paramsSchema.safeParse(normalizedParams) → else adapter_params_invalid
8. Branch:
   - With X-Synapse-Scenario-Run-Id: FIFO fixture → resultSchema → assertJsonSerializable(result, "result") → return
   - Without header: invokeLive → resultSchema → assertJsonSerializable(result, "result") → return
```

**Error precision:** catalog vs mount vs method are separate steps so operators see `adapter_source_unknown` vs `adapter_source_not_mounted` vs `adapter_method_unknown`, not a blurred “not found”.

**Result JSON safety:** after `resultSchema` succeeds, run `assertJsonSerializable(result, "result")` before HTTP response. Failures fold into `adapter_result_invalid` (live) or `adapter_fixture_result_invalid` (scenario) with `fieldPath: result` and `valueKind` when serializability is the cause.

Scenario mode must never fall back to live.

Callers (`invokeAdapter`) run steps 2–3 (and 7 on client optional) before HTTP for faster, stack-preserving errors.

---

## Dev scenario run API

Scenario adapter fixtures are installed once per `dev:once` run into `apps/adapters`.

Dev routes are enabled only when:

```text
SYNAPSE_DEV_SCENARIO_CONTEXT=1 | true | yes
```

If disabled, return `404`.

### Install scenario run

```http
POST /v1/dev/scenario-runs
Content-Type: application/json
```

Body after `dev:once` resolves all `{ file }` / `{ data }` values:

```json
{
  "scenarioId": "review-pr/gitlab-synapse",
  "adapters": [
    {
      "source": "synapse.adapters.gitlab.v1",
      "method": "fetchChanges",
      "params": {
        "projectId": 202,
        "mergeRequestIid": 42
      },
      "returns": {
        "project_id": 202,
        "merge_request_iid": 42,
        "changes": []
      }
    }
  ]
}
```

Response:

```json
{
  "scenarioRunId": "scnrun_1730000000000"
}
```

`scenarioRunId` must start with `scnrun_`. Only **adapter-eligible** calls appear in this payload; in-process dependencies (e.g. Pi harness) are not installed here.

### Install validation (required, atomic)

`POST /v1/dev/scenario-runs` validates **every** fixture before creating a run. Install is **atomic**: if any fixture fails, return an error, **do not** allocate `scenarioRunId`, and **do not** install partial queues.

For each entry in `adapters[]` (after `dev:once` has resolved `{ file }` / `{ data }` to JSON):

1. `source` exists in `ADAPTER_SOURCE_CATALOG`
2. `source` is mounted on the active manifest `adapters[]` (validate using manifest passed or implied by dev session)
3. `method` exists on that source in the method registry
4. `params` are JSON-safe; normalize omitted to `{}`
5. `params` match `paramsSchema`
6. `returns` are JSON-safe
7. `returns` match `resultSchema`

On failure, response includes `scenarioId`, fixture index, `source`, `method`, and `fieldPath`. `dev:once` surfaces this before any ingress step.

### Delete scenario run

```http
DELETE /v1/dev/scenario-runs/{scenarioRunId}
```

Removes queues for that run.

`dev:once` must call this in a `finally` block.

---

## Scenario adapter FIFO semantics

Scenario adapter queues are global per `scenarioRunId` inside `apps/adapters`.

Matching key:

```text
source + method + stableStructuralJson(parsedParams)
```

`parsedParams` is always an object (`{}` when omitted), never `undefined` or `null` on the matching key.

Consumption:

```text
Each matching adapter call consumes the next fixture FIFO.
If the key exists but no entries remain -> adapter_fixture_exhausted.
If no key exists -> adapter_fixture_not_found.
If scenarioRunId is unknown -> adapter_scenario_run_unknown.
```

No live fallback is allowed when `X-Synapse-Scenario-Run-Id` is present.

### Example

Scenario adapters:

```json
[
  {
    "source": "synapse.adapters.jira.v1",
    "method": "searchIssues",
    "params": { "label": "needs-ai-enrichment" },
    "returns": { "issues": [] }
  },
  {
    "source": "synapse.adapters.jira.v1",
    "method": "searchIssues",
    "params": { "label": "needs-ai-enrichment" },
    "returns": { "issues": [{ "key": "ENG-123" }] }
  }
]
```

Call order:

```text
apps/ingress calls synapse.adapters.jira.v1.searchIssues -> returns []
apps/worker calls synapse.adapters.jira.v1.searchIssues  -> returns [{ key: 'ENG-123' }]
```

This is the primary reason the adapter RPC service exists.

---

## Scenario files

Scenario files keep the settled shape:

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/scenario/run-loop.v1.schema.json",
  "scenarios": [
    {
      "id": "review-pr/gitlab-synapse",
      "title": "Review PR (GitLab synapse)",
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
          "params": {
            "projectId": 202,
            "mergeRequestIid": 42
          },
          "returns": {
            "file": "fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json"
          }
        }
      ],
      "terminalEventTypes": ["pr.reviewed.v1"]
    }
  ]
}
```

Pi harness is **not** in `adapters[]`; it is faked via injected `PiHarnessPort` (see [Canonical shipped example](#canonical-shipped-example)). Pi fixture files belong under `fixtures/agent-reviewer/pi-harness/`, not `fixtures/.../adapters/`.

Important distinction:

```text
ingress.fixtures[] = things entering the system: webhook payloads or poll tick fixture values
adapters[]         = mocked adapter method call returns
```

`apps/adapters` receives only resolved `adapters[].returns` JSON. It does not read fixture files.

---

## `dev:once` flow

For a scenario with `adapters[]`:

```text
1. Acquire .synapse/active-scenario-run.lock.
2. Resolve scenario adapters[].returns from { file } / { data }.
3. POST resolved adapter fixtures to apps/adapters /v1/dev/scenario-runs.
4. Receive scenarioRunId.
5. Write .synapse/active-scenario-run.json.
6. Trigger webhook posts or poll ticks, passing X-Synapse-Scenario-Run-Id.
7. Worker reads active scenario run binding and passes same header on adapter calls.
8. Wait for terminal events and write run artifact.
9. DELETE scenario run from apps/adapters.
10. Delete active-scenario-run.json and release lock.
```

For a scenario without `adapters[]`, skip install/delete and do not write adapter run binding unless another scenario feature requires it.

---

## Active scenario run binding

Path:

```text
.synapse/active-scenario-run.json
```

Lock:

```text
.synapse/active-scenario-run.lock
```

Shape:

```json
{
  "scenarioRunId": "scnrun_1730000000000",
  "scenarioId": "review-pr/gitlab-synapse",
  "startedAt": "2026-05-21T12:00:00.000Z"
}
```

Rules:

* This is local-dev-only state.
* It is process-global per repo root (one active pointer, not a registry of all runs).
* It tells the **worker** which `scenarioRunId` to send; ingress does not need this file because `dev:once` sets the header on each ingress HTTP call.
* It is valid only because `dev:once` enforces one active scenario run at a time (see [Worker](#worker) under Passing `scenarioRunId`).
* Worker reads it only when `SYNAPSE_DEV_SCENARIO_CONTEXT=1`.
* Do not embed `adapters[]` in this file after migration (fixtures live only in `apps/adapters` under `scenarioRunId`).
* Future production binding should attach `scenarioRunId` (or equivalent) to durable run/job metadata on the event or agent run row, not a repo-local file.

---

## Passing `scenarioRunId`

### Webhook ingress

Webhook bodies remain production-shaped.

Pass run id as a header:

```http
X-Synapse-Scenario-Run-Id: scnrun_1730000000000
```

### Poll tick

Also pass as a header:

```http
POST /v1/poll/{sourceId}/tick
X-Synapse-Scenario-Run-Id: scnrun_1730000000000
```

Poll tick body may still contain scenario fixture context for poll `ingress.fixtures[]` only:

```json
{
  "scenarioFixtureContext": {
    "scenarioId": "example/echo-poll",
    "ingressFixture": []
  }
}
```

Do not send adapter mocks in poll tick bodies.

### Worker

The worker does **not** receive `X-Synapse-Scenario-Run-Id` from the ingress HTTP request that created the event. By the time a handler runs, execution has crossed process boundaries (ingress → Postgres → MQTT/BullMQ → worker). The worker must discover which adapter scenario run applies from **out-of-band local state**.

In v1 that state is `.synapse/active-scenario-run.json`:

```text
dev:once writes { scenarioRunId, scenarioId, startedAt }
worker handler starts
  -> read binding file (when SYNAPSE_DEV_SCENARIO_CONTEXT=1)
  -> AdapterPort includes X-Synapse-Scenario-Run-Id on every invoke
  -> apps/adapters routes to that run's isolated FIFO queues
```

#### What isolation means

Each `scenarioRunId` is a **separate adapter scenario instance** inside `apps/adapters`:

| Isolated per `scenarioRunId` | Shared across all runs |
| --- | --- |
| Fixture FIFO queues (`source` + `method` + `params` → ordered `returns`) | Live adapter implementations and vendor clients |
| Consumption counters for that run | Method registry and catalog validation |

Two concurrent `dev:once` runs with different `scenarioRunId` values must not share fixture state. Run A’s first `gitlab.fetchChanges` must not consume a fixture intended for run B.

`POST /v1/dev/scenario-runs` creates that instance; `DELETE /v1/dev/scenario-runs/{scenarioRunId}` destroys it. Invokes without the header use **live** mode and never read those queues.

#### Why a repo-local binding file (v1)

Ingress and poll paths get `scenarioRunId` **directly** from `dev:once` on each HTTP call (header on webhook POST / poll tick). The worker has no equivalent unless something records “the active proof run is `scnrun_…`”.

The binding file is that record: a single pointer from “we are in a hermetic scenario proof” → `scenarioRunId`. It is intentionally **not** embedded in the event payload in v1 (production would attach run context to durable job metadata instead).

#### Single active run (v1 limitation)

`dev:once` enforces **at most one** active scenario run per repo root:

* `.synapse/active-scenario-run.lock` — exclusive lock for the duration of the run;
* one binding file — no map of `scenarioRunId` by event id.

So v1 does **not** support overlapping `dev:once` processes against the same clone, and the worker does not select among multiple scenario runs by `inputEventId`. If a handler runs while a binding file exists, it always uses that file’s `scenarioRunId`.

That is a deliberate simplification: correct FIFO across ingress + worker matters more for v1 than concurrent scenario proofs on one machine.

#### Failure modes to avoid

| Mistake | Symptom |
| --- | --- |
| Worker invokes without header while binding file exists | Live GitLab (or other mounted adapters) called during curriculum → flaky tests, tokens spent |
| Stale binding file after crashed `dev:once` | Wrong fixtures or `adapter_scenario_run_unknown` on invoke |
| Second `dev:once` without lock | Two runs share one binding / corrupt FIFO ordering |

`dev:once` must delete the binding file and call `DELETE` on `apps/adapters` in `finally` so the next run starts clean.

#### Contrast with ingress

```text
Ingress:  dev:once passes X-Synapse-Scenario-Run-Id per request (explicit, request-scoped)
Worker:   dev:once writes binding file once; worker applies same id to all handler adapter calls until cleanup
Both:     same scenarioRunId -> same isolated queues in apps/adapters
```

---

## Manifest adapter mounts

Like `agents[]`, `webhooks[]`, and `pollers[]`, the runtime manifest declares **which adapter sources are loaded** for a dev session or deployment. Different manifests enable different adapter families (example echo manifest mounts none; application manifest mounts GitLab only in v1). In-process libraries such as `libs/pi-harness` are **not** manifest-mounted.

### Manifest shape

Add optional `adapters[]` to `libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json`:

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
  "webhooks": [{ "source": "synapse.webhooks.prs.v1" }],
  "adapters": [{ "source": "synapse.adapters.gitlab.v1" }],
  "scenarios": [
    "scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json"
  ]
}
```

Each entry has only `source` (same mount pattern as webhooks). No per-method manifest lines in v1—mounting a source enables **all** methods registered for that source in `apps/adapters`.

### Adapter source catalog

Authoritative ids live in `libs/runtime-manifest/src/adapter-source-catalog.ts` (parallel to `webhook-route-catalog.ts` and `poll-source-catalog.ts`):

```ts
export const ADAPTER_SOURCE_CATALOG = {
  'synapse.adapters.gitlab.v1': {
    description: 'GitLab merge request IO',
    methods: ['fetchChanges'] as const,
  },
  // Pi harness: in-process (libs/pi-harness), not in ADAPTER_SOURCE_CATALOG for v1.
} as const;

export type AdapterSourceId = keyof typeof ADAPTER_SOURCE_CATALOG;
```

Manifest Zod validates `adapters[].source` against `adapterSourceIdSchema` (enum derived from catalog keys).

### Who reads the manifest

| Process | Behavior |
| --- | --- |
| `apps/adapters` | On startup: `SYNAPSE_RUNTIME_MANIFEST` (same as worker). Build **complete** method registry from all method modules. At invoke: reject sources not in catalog (`adapter_source_unknown`) or not in `manifest.adapters[]` (`adapter_source_not_mounted`). |
| `apps/worker` | Unchanged agent loading; `ctx.adapters` HTTP client targets `ADAPTERS_BASE_URL`. |
| `apps/ingress` | Same client for poll registrars / ingress-time adapter calls. |
| `libs/dev-once` | Before `dev:once` ingress steps: every `scenario.adapters[].source` must appear in the active manifest `adapters[]` (fail fast with scenario id + source). |
| `npm run dev` | Start `apps/adapters` whenever worker starts; pass the same manifest path env to adapters, worker, and ingress. |

Example manifest without adapters (echo curriculum):

```json
{
  "name": "example-echo",
  "agents": [{ "name": "example-echo", "handler": "...", "handles": ["example.ping.v1"] }],
  "webhooks": [{ "source": "synapse.webhooks.example-echo-ping.v1" }],
  "scenarios": ["scenarios/echo.scenarios.json"]
}
```

No `adapters[]` key → `apps/adapters` runs with an empty mount set (invoke returns `adapter_source_not_mounted` for any call). Echo scenarios without `adapters[]` are unaffected.

### Validation rules

1. **Manifest parse:** unknown `adapters[].source` → validation error at manifest load.
2. **Scenario vs manifest:** when a scenario references `adapters[]`, each `source` must be mounted on the **active** manifest used by `npm run dev` / `dev:once`.
3. **Invoke:** `POST /v1/adapters/{source}/{method}` where `source` is not mounted → `adapter_source_not_mounted` (even if the method exists in the global registry).
4. **Catalog vs code:** every `defineAdapterMethod` `source` must exist in `ADAPTER_SOURCE_CATALOG`; every catalog `methods[]` entry must have a registered method module (arch test or startup check in `apps/adapters`).

### Manifest owns / must not own

Manifest **owns:**

* which adapter **sources** are enabled for this session;
* agents, webhooks, pollers, scenario file paths (unchanged).

Manifest **must not** own:

* adapter `returns` / mocks (scenarios only);
* scenario execution order;
* fixture bytes.

Remove old `agents[].adapterFixtures` support once migration is complete.

---

## `npm run dev` integration

`npm run dev` should start `apps/adapters` whenever it starts the worker. `apps/adapters` receives the same `SYNAPSE_RUNTIME_MANIFEST` (and optional `--manifest` CLI path) as the worker so mounted adapter sources match the session.

Process order:

```text
1. Docker infra
2. apps/adapters
3. apps/worker
4. apps/ingress, if manifest has webhooks or pollers
```

Environment defaults:

| Variable                       | Default                 | Consumers                                      |
| ------------------------------ | ----------------------- | ---------------------------------------------- |
| `ADAPTERS_HOST`                | `127.0.0.1`             | `apps/adapters`                                |
| `ADAPTERS_PORT`                | `3104`                  | `apps/adapters`                                |
| `ADAPTERS_BASE_URL`            | `http://127.0.0.1:3104` | `apps/worker`, `apps/ingress`, `libs/dev-once` |
| `SYNAPSE_DEV_SCENARIO_CONTEXT` | `1` under `npm run dev` | `apps/adapters`, `apps/worker`, `apps/ingress` |

Do not tie `SYNAPSE_DEV_SCENARIO_CONTEXT` to whether ingress starts. It is a local-dev scenario capability and should be set consistently under `npm run dev`.

Startup banner:

```text
Adapters  http://127.0.0.1:3104
```

---

## `apps/adapters` live deps

`apps/adapters` creates live dependency objects once on startup.

Example:

```ts
export type AdapterLiveDeps = {
  gitlabClient: GitLabMergeRequestClient;
  // Pi harness clients live in agent/worker injection paths, not here.
};
```

The app passes these deps to `invokeLive`.

```ts
const result = await method.invokeLive(parsedParams, liveDeps);
```

**Adapter RPC:** secrets for mounted adapter methods live in `apps/adapters` env/config only. Agents must not read vendor secrets for operations that go through `ctx.adapters`.

**In-process dependencies:** must document config/secrets ownership in their README. Agents should not casually read `process.env` vendor tokens inside handlers; prefer construction through an agent factory or worker/test wiring (e.g. `createReviewPrAgent({ piHarness })` with env read in the factory or harness module).

---

## Error semantics

### Scenario mode

| Code                             | Meaning                                         |
| -------------------------------- | ----------------------------------------------- |
| `adapter_scenario_run_unknown`   | Header references a missing scenario run        |
| `adapter_fixture_not_found`      | No fixture matched `source` + `method` + params |
| `adapter_fixture_exhausted`      | Matching FIFO queue has no remaining entries    |
| `adapter_fixture_result_invalid` | Fixture return failed `resultSchema` or is not JSON-serializable |
| `adapter_params_not_serializable` | Params contain undefined, BigInt, Date, function, circular ref, etc. |
| `adapter_params_invalid`         | Params JSON-safe but failed `paramsSchema` (Zod) |
| `adapter_body_invalid_json`      | HTTP body is not valid JSON                     |
| `adapter_request_invalid`        | Top-level invoke body shape wrong               |

### Live mode

| Code                     | Meaning                                  |
| ------------------------ | ---------------------------------------- |
| `adapter_source_unknown` | Unknown source (not in catalog / registry) |
| `adapter_source_not_mounted` | Known source but not listed in active manifest `adapters[]` |
| `adapter_method_unknown` | Unknown method under source              |
| `adapter_params_invalid` | Params validation failed                 |
| `adapter_vendor_error`   | Vendor HTTP/SDK failed                   |
| `adapter_result_invalid` | Live result failed `resultSchema` or is not JSON-serializable after parse |

Suggested HTTP status mapping:

| Situation                   | Status |
| --------------------------- | ------ |
| source not in catalog       | `404` (`adapter_source_unknown`) |
| source not mounted          | `404` (`adapter_source_not_mounted`) |
| method unknown on source    | `404` (`adapter_method_unknown`) |
| params not serializable     | `400` (`adapter_params_not_serializable`) |
| invalid params (Zod)        | `400` (`adapter_params_invalid`) |
| invalid JSON body           | `400` (`adapter_body_invalid_json`) |
| unknown scenarioRunId       | `404`  |
| fixture not found/exhausted | `409`  |
| invalid fixture result      | `422`  |
| vendor error                | `502`  |
| invalid live result         | `500`  |

Stable error `code` matters more than exact HTTP status.

---

## Observability

Use existing runtime observability conventions.

Span:

```text
adapter.request
```

Attributes:

```text
synapse.adapter.source
synapse.adapter.method
synapse.adapter.mode = live | scenario
synapse.result
synapse.scenario.run_id, when active
```

Metric:

```text
synapse.adapter.requests
```

Labels:

```text
source
method
mode = live | scenario
outcome = success | error
```

Do not label by MR id, issue key, URL, customer, raw params, or scenario id.

Logging:

* log `source`, `method`, `mode`, `outcome`, `scenarioRunId` when active;
* never log tokens;
* avoid full large payloads at info level;
* include validation errors in safe summarized form.

---

## Security and safety

* `/v1/dev/scenario-runs` routes are disabled unless `SYNAPSE_DEV_SCENARIO_CONTEXT=1`.
* Production should not expose dev routes.
* Scenario mode never falls back to live.
* Scenario install payloads are resolved JSON; `apps/adapters` does not read fixture paths.
* `dev:once` enforces repo-relative fixture paths with no `..` before install.
* Define a max request/response JSON body size, default `10 MiB` unless a method documents an exception.
* Secrets live in `apps/adapters` env/config, not in agents or scenario files.

---

## Documentation requirements

Borderline capabilities must be **explicitly classified** in docs — not left ambiguous.

### Per adapter source: `adapters/adapter-<family>/README.md`

Required for every package under `adapters/*`. Must document:

1. **Source id** — e.g. `synapse.adapters.gitlab.v1`
2. **Methods** — e.g. `fetchChanges`
3. **Why each method is an adapter** — checklist answers; link to `boundary.reason` on each method
4. **Why it is not in-process** — e.g. agents must not hold GitLab tokens or construct GitLab clients directly
5. **Params and result contract** — human-readable summary in addition to Zod
6. **Scenario fixture behavior** — example `adapters[]` scenario entry
7. **Operational notes** — secrets, env vars, rate limits, timeouts, internal pagination
8. **Non-goals** — operations that must remain in-process (e.g. “Pi streaming review is not this adapter”)

Per-method detail may live in `adapters/adapter-<family>/src/methods/<method>.md` or in the method module’s `boundary` block.

### Per in-process IO / harness library: README (e.g. `libs/pi-harness/README.md`)

Required when the library performs external IO, model calls, streaming, or harness orchestration and is **not** an adapter. Must document:

1. **Why it is not an adapter** — especially streaming/session/control-flow
2. **Whether it performs external IO**
3. **How it is constructed or injected** — `createReviewPrAgent({ piHarness })`, env flags, etc.
4. **How tests and scenarios fake it** — not `scenario.adapters[]`; fixture paths outside `fixtures/.../adapters/`
5. **Whether it is safe for direct import by agents** or should only be injected through an agent factory
6. **Secrets** — where tokens live; discourage ad hoc `process.env` in handlers
7. **What would trigger promotion** — bounded Adapter RPC method vs future runtime-service design

In-process status must be **deliberate**, not accidental omission from `adapters/`.

---

## Migration plan

### Phase 0: `adapters/` repo layout

* Add `"adapters/*"` to root `package.json` workspaces.
* Move `libs/adapter-gitlab` → `adapters/adapter-gitlab` (package name stays `adapter-gitlab`).
* Confirm `libs/pi-harness` remains in-process; update its README per [in-process library documentation](#per-in-process-io--harness-library-readme-eg-libspi-harnessreadmemd).
* Update `tsconfig.json` paths, Vitest aliases, `docs/reference/package-map.md`, and any allowlists that reference `libs/adapter-*`.

### Phase 1: `runtime-adapters` + manifest catalog

Create shared contract library:

* `defineAdapterMethod`;
* `AdapterPort`;
* `assertJsonSerializable`;
* `AdapterInvokeError`;
* `createAdapterHttpClient`;
* `invokeAdapter` (agentName required, pre-flight serialization);
* `createAdapterMethodRegistry` (complete registry; mount policy separate at invoke);
* `scenario-queue`;
* `stable-json`;
* headers.

Add to `libs/runtime-manifest`:

* `adapter-source-catalog.ts`;
* `adapters[]` on runtime manifest schema + Zod;
* validation: scenario adapter sources ⊆ manifest mounts when validating scenarios for dev.

Port existing scenario queue tests from `libs/synapse-scenarios/runtime`.

### Phase 2: first method modules

Create method-owned module for the only shipped v1 adapter operation:

```text
adapters/adapter-gitlab/src/methods/fetch-changes.ts
adapters/adapter-gitlab/README.md
```

Each shipped method exports a `defineAdapterMethod(...)` value with required `boundary` metadata. Do not add Pi harness to `adapters/` in v1.

### Phase 3: `apps/adapters`

Create service:

* `/v1/adapters/:source/:method`;
* `/v1/dev/scenario-runs` install/delete;
* in-memory scenario run store;
* complete method registry; manifest mount checks at invoke and on `POST /v1/dev/scenario-runs`;
* load `SYNAPSE_RUNTIME_MANIFEST` on startup;
* live deps;
* observability.

### Phase 4: worker and ingress clients

* parse `ADAPTERS_BASE_URL`;
* inject `ctx.adapters` into worker agent contexts;
* use adapter HTTP client in ingress registrars that call adapters;
* pass scenario run header.

### Phase 5: `dev:once` global scenario install

* resolve scenario `adapters[].returns`;
* install scenario run on `apps/adapters`;
* write slim `.synapse/active-scenario-run.json`;
* delete run and cleanup in `finally`;
* delete per-process adapter queues.

### Phase 6: migrate agents

* migrate `agent-reviewer` GitLab path to `ctx.adapters` / `invokeAdapter` for `fetchChanges` only;
* keep `libs/pi-harness` in-process with `PiHarnessPort` injection; move Pi fixtures to `fixtures/agent-reviewer/pi-harness/`;
* remove direct GitLab client construction from handlers;
* remove `synapse.adapters.pi-review.v1` from scenario `adapters[]` and manifest mounts if present;
* remove manifest-level adapter fixtures.

---

## Acceptance criteria

* [ ] Adding an adapter method requires one method module plus one import in `apps/adapters/src/method-registry.ts`.
* [ ] Method module owns source, method, params schema, result schema, and live implementation.
* [ ] `apps/ingress` and `apps/worker` invoke migrated adapters only through `AdapterPort` / HTTP to `apps/adapters`.
* [ ] Scenario adapter FIFO is global per `scenarioRunId` across ingress and worker.
* [ ] Scenario mode never falls back to live adapters.
* [ ] Params and results validate on every invoke; results pass `assertJsonSerializable` before HTTP response.
* [ ] Repeated identical adapter calls dequeue FIFO in call order across processes.
* [ ] `dev:once` installs and deletes scenario runs on `apps/adapters`.
* [ ] Worker reads slim `active-scenario-run.json` and sends scenario run header.
* [ ] `npm run dev` starts `apps/adapters` before worker.
* [ ] Dev routes require `SYNAPSE_DEV_SCENARIO_CONTEXT=1`.
* [ ] Integration test proves ingress consumes first fixture and worker consumes second from one shared queue.
* [ ] Runtime manifest `adapters[]` controls which sources accept invokes; unmounted sources return `adapter_source_not_mounted`.
* [ ] `dev:once` rejects scenario `adapters[].source` values not mounted on the active manifest.
* [ ] Adapter `source` ids use `synapse.adapters.{family}.v1` (versioned catalog ids), not bare vendor names.
* [ ] Non-JSON-safe params fail with `adapter_params_not_serializable`, `fieldPath`, `valueKind`, and `agentName` before HTTP.
* [ ] Zod param failures use `adapter_params_invalid` with distinct messages; never conflated with serializability errors.
* [ ] Unit tests cover BigInt, undefined, circular refs, and Zod shape errors with stable `code` and `fieldPath`.
* [ ] Spec documents out-of-process Adapter RPC vs in-process agent dependency (two categories).
* [ ] Streaming, callbacks, sessions, and partial results are out of scope for Adapter RPC v1.
* [ ] Every adapter source under `adapters/*` has README documentation per [Documentation requirements](#documentation-requirements).
* [ ] Every in-process IO/harness library used in curriculum (e.g. `libs/pi-harness`) documents why it is not an adapter.
* [ ] Pi harness is in-process only; not `synapse.adapters.pi-review.v1`; not in `scenario.adapters[]`.
* [ ] New adapter methods require completed [adapter decision checklist](#adapter-decision-checklist-required-for-new-methods).
* [ ] `adapters/*` packages are not imported by `agents/*` runtime handler code.
* [ ] `libs/pi-harness` is not imported by `apps/adapters`.
* [ ] In-process fake fixture files are not installed through `POST /v1/dev/scenario-runs`.
* [ ] `POST /v1/dev/scenario-runs` validates all fixtures atomically before creating `scenarioRunId`.
* [ ] Method registry is complete; manifest mounts enforced separately at invoke.
* [ ] Omitted `params` normalize to `{}`; FIFO matching uses `parsedParams`.

---

## Canonical shipped example

End-to-end curriculum: **`review-pr/gitlab-synapse`**. The manifest loads agents, ingress, and the GitLab adapter source; the scenario declares ingress fixtures and **adapter** mocks for GitLab only. Pi harness is in-process.

### Manifest

`manifests/application.json` (or equivalent dev manifest for agent-reviewer):

```json
{
  "version": 1,
  "schema": "libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json",
  "name": "application-default",
  "description": "Agent reviewer with GitLab adapter mount (Pi harness is in-process)",
  "agents": [
    {
      "name": "agent-reviewer",
      "handler": "agents/agent-reviewer/src/review-pr-agent.ts",
      "handles": ["pr.received.v1"]
    }
  ],
  "webhooks": [{ "source": "synapse.webhooks.prs.v1" }],
  "adapters": [{ "source": "synapse.adapters.gitlab.v1" }],
  "scenarios": [
    "scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json"
  ]
}
```

Mount rules for this example:

* **`adapters[]`** — enables invoke for `synapse.adapters.gitlab.v1` only in v1. Pi harness is not mounted. No methods or fixture paths on the manifest.
* **`webhooks[]`** — mounts PR webhook ingress used by the scenario’s `ingress.source`.
* **`scenarios[]`** — discovery only; `dev:once --list` / `--fixture review-pr/gitlab-synapse` read the scenario file path from here.
* Every `adapters[].source` in the scenario file below must appear in manifest `adapters[]` or `dev:once` fails at startup.

```text
npm run dev -- --manifest manifests/application.json
  -> starts apps/adapters (gitlab mounted), worker, ingress
npm run dev:once -- --fixture review-pr/gitlab-synapse
  -> resolves manifest (default application.json); scenario adapters must ⊆ manifest adapters[]
```

### Scenario

Entry `review-pr/gitlab-synapse` in `scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json`:

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
      "params": {
        "projectId": 202,
        "mergeRequestIid": 42
      },
      "returns": {
        "file": "fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json"
      }
    },
  ],
  "terminalEventTypes": ["pr.reviewed.v1"]
}
```

Scenario `adapters[]` covers **GitLab only**. `adapters[].source` must match manifest `adapters[]` (`synapse.adapters.gitlab.v1`).

### In-process: Pi harness (same curriculum)

`agent-reviewer` uses `libs/pi-harness` **inside the handler** — not `ctx.adapters`:

```ts
// Hermetic test / scenario wiring (not scenario.adapters[]):
createReviewPrAgent({
  piHarness: createPiReviewMockClient({
    repoRoot,
    rules: loadRulesFrom('fixtures/agent-reviewer/pi-harness/pi-review-synapse.json'),
  }),
});
```

Pi fixture JSON lives under **`fixtures/agent-reviewer/pi-harness/`** (not `fixtures/.../adapters/`). It is **not** sent to `POST /v1/dev/scenario-runs`.

### Execution

```text
dev:once resolves scenario adapters[].returns (GitLab only)
POST /v1/dev/scenario-runs -> scnrun_...
write .synapse/active-scenario-run.json
POST webhook with X-Synapse-Scenario-Run-Id
worker: invokeAdapter gitlab.fetchChanges -> apps/adapters (FIFO fixture)
worker: piHarness.reviewStream via injected fake (in-process, no adapter header)
worker emits pr.reviewed.v1
dev:once writes artifact
dev:once deletes scenario run and active binding
```

---

## Future extension: generated typed facades

The required v1 API is generic
