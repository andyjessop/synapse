---
title: Create an adapter
kind: how-to
owner: runtime-agent
status: current
updated: 2026-05-21
freshness_triggers:
  - adapters/**
  - apps/adapters/**
  - libs/runtime-adapters/**
  - specs/adapters.md
---

# Create an adapter

## Goal

Add an external I/O boundary as an **adapter source** package under `adapters/`, register it in **`apps/adapters`**, mount it on manifests, and let agents invoke methods through **`ctx.adapters`**.

Background: `specs/adapters.md`.

## Before You Start

- [Agents and adapters](../explanation/agents-and-adapters.md)
- Reference: `adapters/adapter-gitlab/` (`gitlab-adapter.ts`, `definition.ts`, `methods/`)

## Steps

### 1. Create the adapter package

Under `adapters/adapter-<vendor>/`:

```text
src/<vendor>-adapter.ts    # defineAdapterSource({ source, createLiveDeps, methods })
src/definition.ts          # export { <vendor>Adapter } only — for apps/adapters
src/contracts.ts           # Zod params/result schemas for agents
src/methods/<method>.ts    # defineAdapterMethod(...)
src/live-client.ts         # live HTTP/SDK client (adapter package only)
```

Adapter source ids follow **`synapse.adapters.<family>.v<N>`** (see architecture test `adapter-source-id-pattern-alignment`).

### 2. Define the source

```ts
import { defineAdapterSource } from 'runtime-adapters';

export const gitlabAdapter = defineAdapterSource({
  source: 'synapse.adapters.gitlab.v1',
  description: 'GitLab merge request IO',
  createLiveDeps(env) {
    // return undefined when credentials missing
  },
  methods: {
    fetchChanges: gitlabFetchChangesMethod,
  },
});
```

Each method uses **`defineAdapterMethod`** with Zod input/output schemas. **`createLiveDeps`** return type drives method typing — avoid casts at the source boundary.

### 3. Register in `apps/adapters`

Add the adapter to **`apps/adapters/src/shipped-adapters.ts`**:

```ts
import { gitlabAdapter } from 'adapter-gitlab/definition';

export const shippedAdapters = [gitlabAdapter];
```

**`shipped-adapter-runtime.ts`** builds the method registry and `createAdapterLiveDeps` via **`buildShippedAdapterRuntime(shippedAdapters)`**. Duplicate source ids throw at startup.

**New method on an existing source:** add the method module and register it in `defineAdapterSource` — **no** `shipped-adapters.ts` change unless it is a new package.

### 4. Mount on manifests

```json
"adapters": [{ "source": "synapse.adapters.gitlab.v1" }]
```

Agents that call the source must list it in **`defineAgent({ usesAdapters: [...] })`**; manifest load validates the mount.

### 5. Agent invocation

Agents import **`adapter-<vendor>`** default export (contracts only) and call:

```ts
await ctx.adapters.invoke({
  source: 'synapse.adapters.gitlab.v1',
  method: 'fetchChanges',
  params: { /* typed */ },
});
```

Do **not** import `adapter-*/definition` or live clients from agent code.

### 6. Hermetic scenarios (optional)

For `dev:once`, add **`adapters[]`** entries on the scenario file (params + `returns.file`). Scenario validation requires the source to be mounted on the manifest `adapters[]`. See `scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json`.

### 7. Tests

- Unit tests: method schemas, matching, error paths (fakes in the adapter package).
- Integration: `apps/adapters` with `shippedAdapters`; no live third-party tenants in default CI.
- Architecture: `test/architecture/runtime-boundaries.test.ts` — only `shipped-adapters.ts` may import `adapter-*/definition`.

Instrument I/O with `runWithRuntimeSpan` (`adapter.request` hop) and outcome metrics per observability rules.

## Verify

```bash
npx nx run adapter-<vendor>:test
npx nx run adapters:test
```

Mount the source on a manifest, start `npm run dev`, run a scenario that invokes the adapter (or agent unit tests with injected port fakes).

## Troubleshooting

- **Unknown source at invoke:** Source not in `shipped-adapters.ts` or not mounted on manifest `adapters[]`.
- **Scenario adapter exhausted:** FIFO queue consumed; check scenario `adapters[]` ordering vs handler calls.
- **Missing live deps:** `createLiveDeps` returned `undefined` — set env (e.g. `GITLAB_TOKEN`) or use scenario mocks for local proof.
- **Replay safety:** External mutations short-circuit during replay unless execute mode allows them.

Adapters perform external IO; agents decide when IO should happen.

## Related pages

- [Runtime manifest](../reference/runtime-manifest.md)
- [Create an agent](create-an-agent.md)
- `adapters/README.md` (if present), `specs/adapters.md`
