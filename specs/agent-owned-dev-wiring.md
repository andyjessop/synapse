---
title: Agent-owned dev wiring (worker slimdown)
kind: spec
owner: runtime
status: current
updated: 2026-05-20
freshness_triggers:
  - apps/worker/src/dev-adapters*
  - apps/worker/src/manifest-registry.ts
  - agents/agent-reviewer/**
  - libs/pi-harness/**
  - libs/runtime-manifest/**
  - libs/synapse-fixtures/**
  - manifests/**
  - libs/agent-test-harness/**
  - scripts/dev.ts
  - scripts/dev-once/**
  - docs/reference/environment.md
  - docs/how-to/local-agent-development.md
  - agents/agent-reviewer/README.md
  - .cursor/rules/new-agent.mdc
depends_on:
  - specs/synapse-run-loop.md
---

# Agent-owned dev wiring (worker slimdown)

## Goal

Remove **agent-specific adapter wiring** from the **worker** and from cross-cutting **`SYNAPSE_DEV_ADAPTERS_JSON`** configuration. The worker’s job is to load a **runtime manifest**, register handlers, and run the queue — not to know that `agent-reviewer` uses Pi, GitLab fixtures, or `pi-harness`.

**What it should feel like when done:**

- `npm run dev` + `npm run dev:once -- --fixture review-pr/gitlab-synapse` behave as today for the default path (live Pi SDK + fixture MR diffs, harness events, `pr.reviewed.v1`).
- A contributor adding a second application agent does **not** edit `apps/worker`.
- Hermetic / fixture Pi runs are a **deliberate, documented opt-in** with at most **one** reviewer-specific env flag — not a JSON DSL shared across agents.
- `agent-reviewer` is the **only** module that decides how Pi and GitLab clients are built for the review handler.

**Core stack (unchanged):** Runtime manifest, Postgres, webhooks, worker/BullMQ, `runtime-events`, Zod at boundaries, `pi-harness` as a library consumed by the agent (not the worker).

**Key architectural distinction:**

| Layer | Owns local review dependencies | Must not |
| --- | --- | --- |
| `apps/worker` | Manifest load, streams, queue execution | Import `agent-reviewer`, `pi-harness`, `adapter-gitlab`; call `setReviewPrPiClient`; parse Pi/GitLab JSON env |
| `agents/agent-reviewer` | Pi + GitLab client factories, defaults, opt-in hermetic mode, startup hints | MQTT, BullMQ, Redis, Hono |
| `libs/pi-harness` | Pi SDK/process/fixture clients, model/progress env parsing | Worker bootstrap, manifest parsing |
| `scripts/dev.ts` | Infra, manifest path, session file | Inject `SYNAPSE_DEV_ADAPTERS_JSON` |
| Tests / harness | Explicit `setReviewPrPiClient` or env for hermetic runs | Rely on worker knowing agent names |

**Architecture slogan:** Manifest picks agents; agents pick their own local IO; worker runs handlers.

**Non-negotiables:**

- No `SYNAPSE_DEV_ADAPTERS_JSON` in shipped scope.
- No `apps/worker/src/dev-adapters.ts` or `dev-adapters-defaults.ts`.
- No `configureManifestAgentAdapters` / `setReviewPrPiClient` calls in `manifest-registry.ts`.
- Worker `package.json` / import graph must not reference `pi-harness`, `adapter-gitlab`, or `agent-reviewer` for dev wiring (dynamic handler load only).
- Default local dev path stays **live Pi SDK + fixture GitLab MR diffs** without contributors setting env.
- Regression tests and CI stay hermetic (fixture Pi) without reintroducing worker coupling.
- `PI_REVIEW_MODEL` and `PI_HARNESS_PROGRESS` remain **pi-harness / agent-reviewer** concerns (not worker-validated).

This spec **supersedes** worker-centric dev-adapter documentation in `docs/reference/environment.md`, `agents/agent-reviewer/README.md`, and `.cursor/rules/new-agent.mdc` for the items it changes. It **extends** [synapse-run-loop.md](./synapse-run-loop.md) with a manifest field for adapter stub paths; run-loop `*.fixture.json` entries stay on `agents[].fixtures`.

---

## Core model

| Concept | What it is | Owns | Does not own |
| --- | --- | --- | --- |
| Handler module | Manifest `handler` path (e.g. `review-pr-agent.ts`) | Side-effect dev bootstrap for that agent’s dependencies | Other agents’ clients |
| `PiReviewClient` | Agent-local port (`agents/agent-reviewer/src/pi-review-client.ts`) | Review prompt/result contract | Worker injection |
| `configureReviewPrDevClients` | New agent module (authoritative name below) | Resolves clients from **active manifest** + mode env | Declaring fixture paths (manifest owns paths) |
| `agents[].adapterFixtures` | Manifest agent row (new field) | Repo-relative paths to adapter stub files | How stubs are consumed (agent + pi-harness) |
| `setReviewPrPiClient` | Test/production override hook (kept) | Explicit injection when auto-bootstrap must be skipped | Worker startup |
| Hermetic mode | Fixture Pi + fixture GitLab | Opt-in via one env flag or test injection | Global JSON adapter registry |

**Confusing pairs (explicit):**

- **`pi-harness`** (library) vs **`agent-reviewer` dev wiring** — harness implements Pi; the agent module chooses which factory and wires GitLab into the SDK client.
- **`setReviewPrPiClient`** vs **`configureReviewPrDevClients`** — configure runs on handler import for local defaults; setters override for tests or future production injection.
- **Run-loop fixture** (`agents[].fixtures` → `*.fixture.json`) vs **adapter fixtures** (`agents[].adapterFixtures` → stub JSON/Markdown) — both paths live on the manifest agent row; neither is hardcoded in TypeScript.
- **`SYNAPSE_RUNTIME_MANIFEST`** — worker and handler bootstrap read the **same** manifest file the dev session selected; adapter paths are not duplicated in env or agent constants.

---

## Problem statement (current state)

Today `apps/worker/src/dev-adapters.ts`:

- Imports `agent-reviewer`, `pi-harness`, and `adapter-gitlab`.
- Parses `SYNAPSE_DEV_ADAPTERS_JSON` (`pi`, `gitlab`, unused `openai` keys).
- Is merged/injected by `scripts/dev.ts` for `webhooks.routeSet === 'application'`.
- Is duplicated in `libs/agent-test-harness` and `scripts/dev-once/run.ts` (Pi startup lines).

`apps/worker/src/manifest-registry.ts` hard-codes:

```ts
if (manifest.agents.some((a) => a.name === 'agent-reviewer')) {
  setReviewPrPiClient(adapters.pi);
}
```

That violates manifest-driven loading: the worker already loads `agents/agent-reviewer/src/review-pr-agent.ts` from the manifest; **that handler module** should own Pi/GitLab resolution. Adding another agent would incorrectly suggest editing the worker again (`new-agent.mdc` today says to extend `dev-adapters.ts`).

---

## Architecture

### Runtime loop (unchanged)

```text
dev:once fixture POST
  -> webhooks ingress
  -> pr.received.v1
  -> worker plans agent-reviewer
  -> review-pr-agent handler
       (PiReviewClient already configured by agent module load)
  -> pi.tool-call.* (live SDK path)
  -> pr.reviewed.v1
```

### Dependency rules (authoritative)

| Package | May import for review dev path |
| --- | --- |
| `apps/worker` | `runtime-manifest`, `runtime-worker`, `runtime-config`, … — **not** `pi-harness`, `adapter-gitlab`, `agent-reviewer` setters |
| `agents/agent-reviewer` | `pi-harness`, `adapter-gitlab`, `runtime-config` (`getRepoRoot`) |
| `libs/pi-harness` | `agent-reviewer` types (`PiReviewClient`), Pi SDK, observability |
| `scripts/dev.ts` | `runtime-manifest`, `dev-cli-shared` — **not** `dev-adapters-defaults` |
| `libs/agent-test-harness` | `agent-reviewer` bootstrap API — **not** `apps/worker/.../dev-adapters` |

**Forbidden after this work:**

- Worker imports of `setReviewPrPiClient`, `resolveDevAdapters`, `createPiReviewSdkClient`, `createGitLabMergeRequestFixtureClient`.
- Any `SYNAPSE_DEV_ADAPTERS_JSON` parsing outside deleted modules (none remain).

### Local development commands (unchanged surface)

```bash
npm run dev
npm run dev:once -- --fixture review-pr/gitlab-synapse
npm run dev:once -- --list
```

Manifest selection stays on `npm run dev` only ([synapse-run-loop.md](./synapse-run-loop.md)).

---

## Manifest as sole path authority

All repo-relative fixture paths for an agent are declared on that agent’s **manifest row**. TypeScript must not embed default paths like `fixtures/agent-reviewer/gitlab-mr-changes.json`.

| Path kind | Manifest field | File pattern | Consumed by |
| --- | --- | --- | --- |
| Run-loop ingress | `agents[].fixtures` | `*.fixture.json` (existing) | `dev:once`, `synapse-fixtures` validation |
| GitLab MR diff stub | `agents[].adapterFixtures.gitlabChanges` | `.json` (existing stub files) | `adapter-gitlab` fixture client via agent bootstrap |
| Pi review stub | `agents[].adapterFixtures.piReview` | `.md` (existing stub files) | `pi-harness` fixture client via agent bootstrap |

**Authoritative `manifests/application.json` agent row (shipped):**

```json
{
  "name": "agent-reviewer",
  "handler": "agents/agent-reviewer/src/review-pr-agent.ts",
  "handles": ["pr.received.v1"],
  "fixtures": [
    "fixtures/agent-reviewer/review-pr-gitlab-synapse.fixture.json"
  ],
  "adapterFixtures": {
    "gitlabChanges": "fixtures/agent-reviewer/gitlab-mr-changes.json",
    "piReview": "fixtures/agent-reviewer/pi-review-response.md"
  }
}
```

Bootstrap reads the active manifest (`SYNAPSE_RUNTIME_MANIFEST` + `getRepoRoot`), finds the row where `name === 'agent-reviewer'`, and uses `adapterFixtures` for client factories. Wrong or missing manifest → fail at handler import with a message naming the manifest path and agent.

---

## Authoritative shipped scope

### 0. Manifest schema and validation

**Modify** `libs/runtime-manifest/src/manifest-schema.ts`:

```ts
export const runtimeManifestAdapterFixturesSchema = z
  .object({
    gitlabChanges: z.string().min(1),
    piReview: z.string().min(1),
  })
  .strict();

export const runtimeManifestAgentSchema = z
  .object({
    name: z.string().min(1),
    handler: z.string().min(1),
    handles: z.array(z.string().min(1)).min(1),
    fixtures: z.array(z.string().min(1)).optional(),
    adapterFixtures: runtimeManifestAdapterFixturesSchema.optional(),
  })
  .strict();
```

**Add** `validateManifestAdapterFixtures(manifest, { repoRoot })` in `libs/runtime-manifest/src/validate.ts` (or `libs/synapse-fixtures` if shared with fixture path helpers):

- For each `agent.adapterFixtures` present: both paths pass existing `assertRepoRelativeFixturePath` rules (same as run-loop fixtures).
- Files exist under `repoRoot`.
- For `agent-reviewer` on `manifests/application.json` (and any manifest that lists that agent with `adapterFixtures`): field is **required** (validation error if omitted).

**Modify** `manifests/application.json` — add `adapterFixtures` as in the example above.

**Tests:** `libs/runtime-manifest/test/unit/manifest-schema.test.ts`, `validate.test.ts` — accept new field; reject unknown keys; fail when `agent-reviewer` lacks `adapterFixtures` on application manifest.

### 1. Delete worker dev-adapter modules

**Remove files:**

- `apps/worker/src/dev-adapters.ts`
- `apps/worker/src/dev-adapters-defaults.ts`
- `apps/worker/test/unit/dev-adapters.test.ts`
- `apps/worker/test/unit/dev-adapters-defaults.test.ts`
- `apps/worker/test/unit/dev-adapters-pi-sdk.test.ts`

**Modify `apps/worker/src/manifest-registry.ts`:**

- Delete imports from `./dev-adapters` and `./dev-adapters-defaults.js`.
- Delete `configureManifestAgentAdapters`, `formatPiDevAdapterStartupLine` console output, and `resolveDevAdapters` call.
- `loadWorkerManifestRegistry` only: resolve manifest path, `loadValidatedManifestRegistry`, `wrapManifestRuntimeRegistry`, manifest startup line.

**Modify `apps/worker/src/main.ts`:**

- Remove `parseDevAdaptersEnv` import and bootstrap call.

**Modify `apps/worker/test/unit/bootstrap.test.ts`:**

- Remove cases that assert `SYNAPSE_DEV_ADAPTERS_JSON` validation at worker bootstrap.

### 2. Agent-owned bootstrap module

**Create:** `agents/agent-reviewer/src/configure-review-pr-dev-clients.ts`

**Agent manifest name (exact):** `AGENT_REVIEWER_MANIFEST_NAME = 'agent-reviewer' as const`

**Exports (exact names):**

```ts
export const AGENT_REVIEWER_MANIFEST_NAME = 'agent-reviewer' as const;

export type ReviewPrAdapterFixturePaths = {
  gitlabChanges: string;
  piReview: string;
};

export type ReviewPrPiMode = 'live' | 'fixture' | 'process';

export function loadReviewPrManifestAgent(
  env: Record<string, string | undefined>,
  metaUrl: string | URL,
): {
  repoRoot: string;
  manifestPath: string;
  adapterFixtures: ReviewPrAdapterFixturePaths;
};

export function parseReviewPrPiMode(
  env: Record<string, string | undefined>,
): ReviewPrPiMode;

export function resolveReviewPrDevClients(
  env: Record<string, string | undefined>,
  metaUrl: string | URL,
): { pi: PiReviewClient; gitlab: GitLabMergeRequestClient };

export function configureReviewPrDevClients(
  env?: Record<string, string | undefined>,
  metaUrl?: string | URL,
): void;

export function formatReviewPrDevStartupLine(
  env: Record<string, string | undefined>,
  metaUrl?: string | URL,
): string;
```

**`loadReviewPrManifestAgent` behavior:**

1. `repoRoot = getRepoRoot(metaUrl)`.
2. `manifestPath = resolveManifestPath(repoRoot, env)` (from `runtime-manifest`; requires `SYNAPSE_RUNTIME_MANIFEST` or default application manifest).
3. `parseRuntimeManifestFile(readFileSync(manifestPath))`.
4. Find `agents.find((a) => a.name === AGENT_REVIEWER_MANIFEST_NAME)`.
5. If missing or `adapterFixtures` undefined → throw `Error` with manifest path and agent name.
6. Return `{ repoRoot, manifestPath, adapterFixtures: agent.adapterFixtures }`.

No hardcoded fixture path strings in this module.

**Behavior of `configureReviewPrDevClients`:**

1. If `injectedPiReview` is already set (via prior `setReviewPrPiClient`), **no-op** (tests and explicit overrides win).
2. Else call `setReviewPrPiClient(resolveReviewPrDevClients(env, metaUrl).pi)`.

**Behavior of `resolveReviewPrDevClients`:**

1. `const { repoRoot, adapterFixtures } = loadReviewPrManifestAgent(env, metaUrl)`.
2. GitLab (always fixture client in local dev): `createGitLabMergeRequestFixtureClient({ repoRoot, changesFile: adapterFixtures.gitlabChanges })`.
3. Pi mode from `parseReviewPrPiMode(env)`:

| `ReviewPrPiMode` | Factory |
| --- | --- |
| `live` | `createPiReviewSdkClient({ repoRoot, env, gitlab })` |
| `process` | `createPiReviewProcessClient({ repoRoot, env })` |
| `fixture` | `createPiReviewFixtureClient({ repoRoot, fixtureFile: adapterFixtures.piReview })` |

**`parseReviewPrPiMode` rules:**

- If `env.AGENT_REVIEWER_HERMETIC` is truthy (`1`, `true`, `yes`, case-insensitive): return `'fixture'`.
- Else if `env.AGENT_REVIEWER_PI_MODE` is set: parse strict enum `live` \| `fixture` \| `process`; invalid value throws via Zod `z.enum`.
- Else: return `'live'`.

**Hermetic:** `AGENT_REVIEWER_HERMETIC=1` forces fixture Pi; GitLab still uses `adapterFixtures.gitlabChanges` from the manifest (same paths, no env override).

**Wire on handler load:** At top of `agents/agent-reviewer/src/review-pr-agent.ts` (after imports, before handler definition):

```ts
import { configureReviewPrDevClients } from './configure-review-pr-dev-clients.js';

configureReviewPrDevClients();
```

`SYNAPSE_RUNTIME_MANIFEST` must already be set when the worker imports the handler (true for `npm run dev` and test harness).

**Re-export from `agents/agent-reviewer/src/index.ts`:**

- `configureReviewPrDevClients`, `resolveReviewPrDevClients`, `loadReviewPrManifestAgent`, `formatReviewPrDevStartupLine`, `parseReviewPrPiMode`, `AGENT_REVIEWER_MANIFEST_NAME` — for tests and docs.
- Keep `setReviewPrPiClient`, `resetReviewPrPiClientForTest`.

### 3. Environment variables (slim authoritative list)

| Variable | Scope | Shipped behavior |
| --- | --- | --- |
| `SYNAPSE_DEV_ADAPTERS_JSON` | — | **Removed.** Parsing anywhere fails closed in docs only (no parser shipped). |
| `AGENT_REVIEWER_HERMETIC` | `agent-reviewer` | Optional. `1` → fixture Pi + default fixture GitLab. |
| `AGENT_REVIEWER_PI_MODE` | `agent-reviewer` | Optional. `live` \| `fixture` \| `process`. Ignored when `AGENT_REVIEWER_HERMETIC=1`. |
| `OPENAI_API_KEY` | `pi-harness` / Pi SDK | Unchanged. Required for default live path. |
| `PI_REVIEW_MODEL` | `pi-harness` | Unchanged. Default `openai/gpt-5.4-mini`. |
| `PI_HARNESS_PROGRESS` | `pi-harness` | Unchanged. |
| `SYNAPSE_PI_HARNESS_PROGRESS_SNAPSHOT` | `pi-harness` | Unchanged. |

**Do not add** `gitlab.changesFile` or `pi.fixtureFile` env overrides in shipped scope. Paths come only from **`agents[].adapterFixtures`** on the active manifest. Tests that need custom clients use `setReviewPrPiClient` / direct mocks, or a **test manifest** with different `adapterFixtures` paths (not string constants in test bodies).

### 4. `scripts/dev.ts`

- Remove import/export of `DEFAULT_APPLICATION_DEV_ADAPTERS_JSON`, `mergeApplicationDevAdaptersJson`.
- Remove block that sets `merged.SYNAPSE_DEV_ADAPTERS_JSON` when `webhooksRouteSet === 'application'`.
- `createDevRuntimePlan` env: manifest path, `STATE_DIR`, route set, session file only (plus existing runtime config vars).

### 5. `scripts/dev-once/run.ts`

- Remove import from `apps/worker/src/dev-adapters-defaults.js`.
- For `agent-reviewer` + `review-pr/*` fixtures, import `formatReviewPrDevStartupLine` from `agent-reviewer`; pass `loadDotEnvLocal` env and `import.meta.url` so the line resolves paths from the **session manifest** (via `SYNAPSE_RUNTIME_MANIFEST` in env or dev session).
- Startup hint text: restart `npm run dev` after changing **`AGENT_REVIEWER_*`**, **`PI_*`**, or **manifest `adapterFixtures`** (not `SYNAPSE_DEV_ADAPTERS_JSON`).

### 6. `libs/agent-test-harness`

In `start-test-dev-server.ts`:

- Remove imports from `apps/worker/.../dev-adapters`.
- When manifest includes `agent-reviewer` and `routeSet === 'application'`: call `configureReviewPrDevClients(baseEnv, import.meta.url)` **or** set hermetic env on `baseEnv` before worker bootstrap:

```ts
baseEnv.AGENT_REVIEWER_HERMETIC = baseEnv.AGENT_REVIEWER_HERMETIC ?? '1';
configureReviewPrDevClients(baseEnv, import.meta.url);
```

Default integration tests: **hermetic** unless a test explicitly clears hermetic and sets live mode.

### 7. `agents/agent-reviewer` package dependencies (root `package.json` hoisting)

Ensure root workspace resolves:

- `agent-reviewer` imports `pi-harness`, `adapter-gitlab`, `runtime-config` (already via vitest aliases; add normal imports in new module).

Worker must not list these as required for its own source files.

### 8. Documentation and rules

Update (minimal, current-state only per repo doc rules):

- `agents/agent-reviewer/README.md` — hermetic: `AGENT_REVIEWER_HERMETIC=1`; remove `SYNAPSE_DEV_ADAPTERS_JSON` examples.
- `docs/reference/environment.md` — drop `SYNAPSE_DEV_ADAPTERS_JSON` row; add `AGENT_REVIEWER_HERMETIC`, `AGENT_REVIEWER_PI_MODE`.
- `README.md` (root) — default dev path without worker adapter JSON.
- `.cursor/rules/new-agent.mdc` — remove “extend `dev-adapters.ts`”; say new agents own dev client bootstrap in their handler package.
- `docs/how-to/create-an-agent.md`, `docs/reference/runtime-manifest.md`, `docs/explanation/runtime-manifest.md`, `fixtures/README.md` — align with agent-owned wiring.

---

## Data contracts

### `runtimeManifestAdapterFixturesSchema` (authoritative)

```ts
export const runtimeManifestAdapterFixturesSchema = z
  .object({
    gitlabChanges: z.string().min(1),
    piReview: z.string().min(1),
  })
  .strict();
```

Validated at manifest load together with `agents[].fixtures` run-loop entries.

### `parseReviewPrPiMode` schema (in agent package)

```ts
const reviewPrPiModeSchema = z.enum(['live', 'fixture', 'process']);
const hermeticTruthy = z
  .string()
  .optional()
  .transform((v) => ['1', 'true', 'yes'].includes(v?.trim().toLowerCase() ?? ''));
```

### Startup line format (authoritative template)

`formatReviewPrDevStartupLine` loads `adapterFixtures.piReview` from the active manifest and interpolates:

| Mode | Line template |
| --- | --- |
| `live` | `agent-reviewer dev: pi=live SDK (pi.tool-call harness events)` |
| `fixture` | `agent-reviewer dev: pi=fixture (<adapterFixtures.piReview>) — no pi.tool-call harness events` |
| `process` | `agent-reviewer dev: pi=process (subprocess pi -p) — no pi.tool-call harness events` |

Prefix with `agent-reviewer dev:` so multi-agent manifests do not imply a global worker adapter line. The fixture path in the message is the manifest value, not a compile-time constant.

---

## Runtime guarantees

- **At-least-once** handler execution unchanged.
- **Idempotency** unchanged (fixture uniquification in dev-once, external IDs on `pr.reviewed.v1`).
- **Handler module load** configures Pi client once per process; `setReviewPrPiClient` after configure is ignored until `resetReviewPrPiClientForTest`.
- **Production path (out of shipped scope for this spec):** handlers may still throw “No Pi review client configured” if bootstrap is gated later; this spec only requires local dev + test paths to work.

---

## Testing expectations

### Unit

- `agents/agent-reviewer/test/unit/configure-review-pr-dev-clients.test.ts` (new):
  - uses a minimal manifest fixture file (or `manifests/application.json`) with `adapterFixtures` paths pointing at repo fixtures;
  - `loadReviewPrManifestAgent` returns paths from manifest, not hardcoded strings;
  - default mode `live` with gitlab fixture client using `adapterFixtures.gitlabChanges`;
  - `AGENT_REVIEWER_HERMETIC=1` → fixture Pi using `adapterFixtures.piReview`;
  - `AGENT_REVIEWER_PI_MODE=process` → process client;
  - missing `adapterFixtures` on agent row throws;
  - `configureReviewPrDevClients` respects existing `setReviewPrPiClient`.
- Move/adapt assertions from deleted worker `dev-adapters*.test.ts` into agent package (no worker tests for Pi SDK wiring).

### Integration

- **No** `agent-reviewer` package integration tests (no live Pi SDK or LLM in CI). Verify the run loop with `npm run dev` + `npm run dev:once -- --fixture review-pr/gitlab-synapse`.
- `libs/agent-test-harness` — example agents (`echo-dev-once`, `notifier.e2e`) remain the harness references; optional arch-style grep that `apps/worker/src` does not import agent dev wiring.

### Regression (must fail before, pass after)

- Worker `manifest-registry` unit test: loading application manifest does **not** import `agent-reviewer` setters (new test in `apps/worker/test/unit/manifest-registry.test.ts`).

---

## Implementation plan

### Task 0: Manifest `adapterFixtures`

**Create/modify:**

- `libs/runtime-manifest/src/manifest-schema.ts`
- `libs/runtime-manifest/src/validate.ts` (+ adapter fixture validation)
- `manifests/application.json`
- `libs/runtime-manifest/test/unit/*`

**Acceptance:** `npx nx run runtime-manifest:test`; application manifest validates with `adapterFixtures`.

### Task 1: Agent bootstrap module

**Create/modify:**

- `agents/agent-reviewer/src/configure-review-pr-dev-clients.ts`
- `agents/agent-reviewer/src/review-pr-agent.ts` (import configure)
- `agents/agent-reviewer/src/index.ts` (exports)
- `agents/agent-reviewer/test/unit/configure-review-pr-dev-clients.test.ts`

**Acceptance:** Unit tests green; no `fixtures/agent-reviewer/...` string literals in bootstrap source; `npx nx run agent-reviewer:test`.

### Task 2: Remove worker dev-adapters

**Delete/modify:** files listed in §1.

**Acceptance:** `apps/worker` has zero references to `dev-adapters`, `SYNAPSE_DEV_ADAPTERS_JSON`, `setReviewPrPiClient`; `npx nx run worker:test`.

### Task 3: Dev CLI and harness

**Modify:** `scripts/dev.ts`, `scripts/dev.test.ts`, `scripts/dev-once/run.ts`, `libs/agent-test-harness/src/start-test-dev-server.ts`.

**Acceptance:** `npx nx run dev-cli-shared:test` (if any), script tests, agent integration tests green.

### Task 4: Docs and rules

**Modify:** READMEs and docs listed in §8.

**Acceptance:** No doc references `SYNAPSE_DEV_ADAPTERS_JSON` or `apps/worker/src/dev-adapters.ts` as the wiring point.

### Dependency graph

```text
Task 0 (manifest adapterFixtures)
  -> Task 1 (agent bootstrap reads manifest)
  -> Task 2 (delete worker modules)
  -> Task 3 (dev + harness)
  -> Task 4 (docs)
```

---

## Definition of done (global)

- Lint, typecheck, test, format from repo root per post-task-verify-scripts.
- Dev smoke: `npm run dev` + `npm run dev:once -- --fixture review-pr/gitlab-synapse` — snapshot has `pr.reviewed.v1`, `agent-reviewer` succeeded, `pi.tool-call.*` on default live path with `OPENAI_API_KEY` in `.env.local`.
- Hermetic smoke (documented manual check): `AGENT_REVIEWER_HERMETIC=1 npm run dev` + same fixture — no OpenAI required; fixture markdown in review.
- Worker import graph contains no `pi-harness` / `adapter-gitlab` / `setReviewPrPiClient` in `apps/worker/src`.

---

## Deferred (not shipped)

- Per-agent discriminated `adapterFixtures` shapes for non-reviewer agents (second agent adds its own manifest fields in a follow-up).
- Production injection of live Pi/GitLab via adapter registry instead of module singleton.
- Env overrides for individual adapter fixture paths.
- Auto-detect OpenAI absence and fall back to fixture Pi without `AGENT_REVIEWER_HERMETIC` (magic fails open; explicit flag only).
- Removing `agentFixtureSearchDir` directory discovery for run-loop fixtures (explicit `agents[].fixtures` only) — separate from this spec unless requested.

---

## Non-goals

- Do not hardcode repo-relative fixture paths in `agents/agent-reviewer` or `apps/worker`.
- Do not move Pi harness implementation out of `libs/pi-harness` (only **who calls** the factories moves).
- Do not add a second global JSON env to replace the one being removed.
- Do not require `npm run dev` to know agent names for adapter startup lines.
- Do not add worker arch-test package yet (optional grep test only).

---

## Core contract summary

**Manifest** lists agents, run-loop fixtures, and adapter stub paths. **Handlers** read the manifest and wire local IO. **Worker** executes planned runs only. **`pi-harness`** implements Pi; **`agent-reviewer`** chooses factories from manifest paths + mode env. **Hermetic** is one flag or test injection, not a shared adapter JSON DSL.
