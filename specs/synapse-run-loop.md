---
title: Synapse Run Loop
kind: spec
owner: dev-tooling
status: current
updated: 2026-05-20
freshness_triggers:
  - libs/synapse-fixtures/**
  - libs/dev-once/**
  - libs/dev-cli-shared/**
  - libs/runtime-manifest/**
  - libs/agent-test-harness/**
  - scripts/dev.ts
  - scripts/dev-once/**
  - manifests/**
  - fixtures/**
  - examples/fixtures/**
  - docs/**
  - .cursor/rules/**
depends_on:
  - specs/manifest.md
---

# Synapse Run Loop

## Goal

Establish the **Synapse Run Loop** as the canonical way to develop, test, debug, and document Synapse agents: one mental model for maintainers, contributors, and coding agents.

**Core idea:** A Synapse change is proven by starting `npm run dev` with the intended manifest, then running a **fixture** through that already-running server with `npm run dev:once`, and inspecting the resulting **run artifact** (event flow + agent runs + observability links).

**Core stack:** Runtime manifests (`manifests/*.json`), Postgres event store, local webhooks app, worker/BullMQ, `runtime-events` registry, Zod at boundaries, existing `DevOnceRunRecord` graph snapshots under `tmp/dev/runs/`.

**Key architectural distinction:**

| Layer | Owns |
| --- | --- |
| `npm run dev` | Manifest selection, infra, worker, webhooks, `.synapse/dev-session.json` |
| `npm run dev:once` | One fixture ingress into the **active** dev session only |
| Manifest `agents[].fixtures` | Which fixture files belong to which agent |
| Fixture JSON | Ingress contract + optional smoke `expect` |
| Run artifact | What happened after ingress (shared shape for dev CLI and tests) |

**Naming:** **Synapse Run Loop** is the product name. Canonical npm script **`dev:once`**. Library export **`runSynapseOnce`**; test harness exports **`startTestDevServer`**, **`withTestDevServer`**, **`runDevOnce`**.

**Architecture slogan:** Manifest picks agents; fixture proves behavior; artifact is the unit of confidence.

**Non-negotiables:**

- The unit of confidence is the **event flow** (durable events + agent runs), not an isolated function call.
- **`npm run dev` owns manifest selection**; **`dev:once` never accepts `--manifest`**.
- **`dev:once` requires an already-running `npm run dev`** (valid `.synapse/dev-session.json`).
- Application agents and examples use the **same** `dev` + `dev:once` command family.
- Fixtures are **first-class manifest entries** (`agents[].fixtures` paths to `*.fixture.json`).
- **`runDevOnce` does not start the runtime** — use `startTestDevServer` / `withTestDevServer` first.
- No custom assertion DSL; tests use normal Vitest assertions on the run artifact.
- CI and default tests do not call live external APIs.

This spec **extends** [manifest.md](./manifest.md). Where they differ on fixture ownership and command names, **this spec wins** for run-loop shipped scope.

## Core model

| Concept | What it is | Owns | Does not own |
| --- | --- | --- | --- |
| Manifest | JSON listing agents, handlers, `handles`, fixture paths | Which agents and fixtures exist in a dev session | Ingress payload bytes |
| Fixture | Named, validated JSON scenario | Ingress shape, optional `expect` smoke metadata | Runtime lifecycle |
| Dev session | `.synapse/dev-session.json` written by `npm run dev` | Active manifest path/name, route set | Fixture file contents |
| Run artifact | `SynapseRunArtifact` JSON | Proof output for one fixture run | Starting Docker/worker |
| Dev-once graph record | `DevOnceRunRecord` in `libs/dev-cli-shared` | Postgres-sourced events/runs for a root | Manifest/fixture metadata |

**Runtime loop (authoritative):**

```text
fixture ingress (webhook POST to already-running server)
  -> validated first signal (ingress + registry)
  -> durable events (Postgres)
  -> planned agent_runs (manifest handles[])
  -> handler execution (default export)
  -> follow-up events
  -> run artifact (+ tmp/dev/runs snapshot)
```

**Confusing pairs:**

- **`dev:once` CLI** vs **`runDevOnce`** — same proof step (ingress + wait + artifact); both require an already-running server and dev session. Lifecycle is **`npm run dev`** or **`startTestDevServer`**.
- **Fixture `id`** (e.g. `review-pr/gitlab-synapse`) — stable CLI/docs identifier; not necessarily the filename.
- **`SynapseRunArtifact`** — public contract for dev + tests; **`DevOnceRunRecord`** — internal graph snapshot written under `tmp/dev/runs/`; artifact **includes** graph fields and adds manifest/fixture/status wrapper.

## Architecture

### Command boundaries

```text
Terminal 1: npm run dev [-- --manifest <path>]
  -> resolve + validate manifest
  -> start infra / worker / webhooks
  -> write .synapse/dev-session.json

Terminal 2: npm run dev:once [-- --fixture <id>] [-- --list] [-- --json]
  -> read dev-session.json (fail if missing)
  -> load manifest from session.manifest_path
  -> resolve fixture from agents[].fixtures
  -> webhook POST to running webhooks (local dev or test server)
  -> follow Postgres until terminal
  -> print human summary and/or SynapseRunArtifact JSON
  -> always refresh tmp/dev/runs snapshot when webhooks accepted
```

`dev:once` **must not**: accept `--manifest`, start worker/webhooks/Docker, override session manifest, or silently default to `manifests/application.json`.

### Dependency rules

| Package | May import |
| --- | --- |
| `libs/synapse-fixtures` | `runtime-events` (event type validation), Zod |
| `libs/dev-once` | `synapse-fixtures`, `dev-cli-shared`, `runtime-manifest`, `runtime-config`, `runtime-store` |
| `scripts/dev-once/*` | `dev-once`, `dev-cli-shared`, `runtime-config` |
| `libs/agent-test-harness` | `dev-once`, `synapse-fixtures`, existing harness |
| Agent handlers | Must not import `dev-once` or fixture CLI |

Webhook route **implementation** may keep TypeScript route tables in `apps/webhooks` during migration; **fixture listing and validation** come from manifest + fixture files in shipped scope.

## Authoritative contracts (shipped scope)

### npm scripts (root `package.json`)

| Script | Role |
| --- | --- |
| `npm run dev` | Manifest selection (`--manifest`, `SYNAPSE_RUNTIME_MANIFEST`); starts stack; writes dev session |
| `npm run dev:once` | **Canonical** fixture sender (`tsx scripts/dev-once.ts`) |
| `npm run dev:example` | Shortcut: `npm run dev -- --manifest manifests/examples/echo.json` only — not a fixture command |

### CLI flags (`dev:once`)

| Flag | Behaviour |
| --- | --- |
| (none) | Interactive: show active manifest → pick agent → pick fixture → run |
| `--fixture <id>` | Non-interactive; `id` must match fixture file `id` |
| `--list` | List agents and fixtures for active session; exit 0 |
| `--json` | Print **only** `SynapseRunArtifact` JSON to stdout |
| `--manifest` | **Rejected** with exit 1 and message to restart `npm run dev` |

Environment (unchanged names, applied to `dev:once`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEV_ONCE_MAX_WAIT_MS` | unset (unbounded) | Max wait for terminal state |
| `DEV_ONCE_POLL_MS` | `500` | Poll interval |
| `WEBHOOKS_HOST` / `WEBHOOKS_PORT` | `127.0.0.1` / `3102` | Loopback webhooks target only |

### Dev session file

Path: **`.synapse/dev-session.json`** (repo root). Written only by **`npm run dev`**.

**Shipped shape** (`devSessionSchema` in `libs/dev-cli-shared`):

```ts
export const devSessionSchema = z
  .object({
    manifest_path: z.string().min(1),
    manifest_name: z.string().min(1),
    webhooks: z
      .object({
        routeSet: z.enum(['application', 'examples']),
      })
      .strict(),
  })
  .strict();
```

Fixture discovery uses manifest `agents[].fixtures` parsed at `dev:once` time.

### Manifest extension

**Modify** `runtimeManifestAgentSchema` in `libs/runtime-manifest/src/manifest-schema.ts`:

```ts
export const runtimeManifestAgentSchema = z
  .object({
    name: z.string().min(1),
    handler: z.string().min(1),
    handles: z.array(z.string().min(1)).min(1),
    fixtures: z.array(z.string().min(1)).optional(),
  })
  .strict();
```

**Modify** `runtimeManifestWebhooksSchema` — **remove** `fixtures` field in shipped scope:

```ts
export const runtimeManifestWebhooksSchema = z
  .object({
    routeSet: z.enum(['application', 'examples']),
  })
  .strict();
```

**Authoritative example** — `manifests/application.json`:

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
    "routeSet": "application"
  }
}
```

**Authoritative example** — `manifests/examples/echo.json`:

```json
{
  "version": 1,
  "name": "example-echo",
  "agents": [
    {
      "name": "example-echo",
      "handler": "examples/agents/example-agent-echo/src/echo-agent.ts",
      "handles": ["example.ping.v1"],
      "fixtures": [
        "examples/fixtures/example-agent-echo/echo.fixture.json"
      ]
    }
  ],
  "webhooks": {
    "routeSet": "examples"
  }
}
```

`agents[].fixtures` contains **repo-root-relative paths only** to JSON fixture files. Inline fixture objects in manifests are **deferred**.

### Fixture file

**Create** `libs/synapse-fixtures/` with Zod schemas and `parseSynapseFixtureFile(path, repoRoot)`.

```ts
export const synapseFixtureSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    title: z.string().min(1),
    agent: z.string().min(1),
    description: z.string().optional(),
    tags: z.array(z.string().min(1)).optional(),
    ingress: z
      .object({
        kind: z.literal('webhook'),
        routeSet: z.enum(['application', 'examples']),
        method: z.literal('POST'),
        path: z.string().min(1),
        headers: z.record(z.string(), z.string()).optional(),
        body: z.union([
          z.unknown(),
          z.object({ file: z.string().min(1) }).strict(),
        ]),
      })
      .strict(),
    expect: z
      .object({
        rootEventType: z.string().min(1).optional(),
        eventTypes: z.array(z.string().min(1)).optional(),
        terminalEventTypes: z.array(z.string().min(1)).optional(),
        agentRuns: z
          .array(
            z
              .object({
                agent: z.string().min(1),
                reactorName: z.string().min(1).optional(),
                status: z.enum(['succeeded', 'failed']).optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SynapseFixture = z.infer<typeof synapseFixtureSchema>;
```

**Authoritative reviewer webhook fixture** — `fixtures/agent-reviewer/review-pr-gitlab-synapse.fixture.json`:

```json
{
  "version": 1,
  "id": "review-pr/gitlab-synapse",
  "title": "Review Synapse merge request 2",
  "agent": "agent-reviewer",
  "description": "Posts the GitLab merge request webhook payload and follows the review flow.",
  "ingress": {
    "kind": "webhook",
    "routeSet": "application",
    "method": "POST",
    "path": "/v1/prs",
    "headers": {
      "X-Gitlab-Event": "Merge Request Hook"
    },
    "body": {
      "file": "fixtures/agent-reviewer/gitlab-merge-request.json"
    }
  },
  "expect": {
    "rootEventType": "pr.received.v1",
    "eventTypes": ["pr.received.v1", "pr.reviewed.v1"],
    "terminalEventTypes": ["pr.reviewed.v1"]
  }
}
```

**Authoritative echo webhook fixture** — `examples/fixtures/example-agent-echo/echo.fixture.json`:

```json
{
  "version": 1,
  "id": "example/echo",
  "title": "Echo ping",
  "agent": "example-echo",
  "ingress": {
    "kind": "webhook",
    "routeSet": "examples",
    "method": "POST",
    "path": "/v1/examples/echo/ping",
    "body": {
      "file": "examples/fixtures/example-agent-echo/ping.json"
    }
  },
  "expect": {
    "rootEventType": "example.ping.v1",
    "eventTypes": ["example.ping.v1", "example.pong.v1"],
    "terminalEventTypes": ["example.pong.v1"]
  }
}
```

`expect` is a **smoke/documentation aid**, not an assertion DSL. **`reactorName` defaults to `handler`** in manifest agents when omitted in `expect.agentRuns`.

### Manifest validation (additions)

Fail manifest parse/validate when:

1. `agents[].fixtures` present but empty array.
2. Any fixture path contains `..` or is not repo-relative POSIX.
3. Fixture file missing on disk.
4. Parsed fixture `agent` ≠ owning `agents[].name`.
5. Duplicate fixture `id` across all agents in one manifest.
6. Fixture ingress event type(s) not in `runtime-events` registry (`handles` + `expect` types).
7. Webhook fixture `ingress.routeSet` ≠ manifest `webhooks.routeSet` when manifest has `webhooks`.
8. Fixture `expect.eventTypes` and `expect.terminalEventTypes` entries exist in registry.

**Remove** validation rule “fixture id must exist in TypeScript catalog” from shipped scope.

### Terminal state and artifact status

**Terminal detection** (in `libs/dev-once`):

1. No `agent_runs` for the root in `pending` or `running`.
2. If fixture defines `expect.terminalEventTypes`, **every** listed type must appear on an event with `rootId` equal to the run root.
3. If any `agent_runs` on the root have `status === 'failed'`, run is not successful.

**`SynapseRunArtifact.status`:**

| Value | When |
| --- | --- |
| `succeeded` | Terminal conditions met; no failed runs; `expect` satisfied when present |
| `failed` | Failed agent run, missing expected terminal/root/events, or ingress/webhook error |
| `timed_out` | `timeoutMs` / `DEV_ONCE_MAX_WAIT_MS` exceeded before terminal |

When `expect` is **absent**, CLI status is `succeeded` iff (1) and no failed runs; ignore missing terminal event types.

When `expect` is **present**, CLI and `runDevOnce` use it to set `failed` (tests may still assert stricter with Vitest).

### Run artifact (`SynapseRunArtifact`)

**Create** `synapseRunArtifactSchema` in `libs/dev-once/src/artifact-schema.ts`:

```ts
export const synapseRunArtifactSchema = z
  .object({
    version: z.literal(1),
    status: z.enum(['succeeded', 'failed', 'timed_out']),
    manifest: z
      .object({
        name: z.string().min(1),
        path: z.string().min(1),
      })
      .strict(),
    fixture: z
      .object({
        id: z.string().min(1),
        path: z.string().min(1),
        title: z.string().min(1),
        agent: z.string().min(1),
      })
      .strict(),
    rootEvent: devOnceRunRecordEventSchema.optional(),
    events: z.array(devOnceRunRecordEventSchema),
    agentRuns: z.array(devOnceRunRecordAgentRunSchema),
    observability: z
      .object({
        jaegerTraceUrl: z.string().url().optional(),
        traceId: z.string().optional(),
      })
      .strict()
      .optional(),
    files: z
      .object({
        artifactPath: z.string().min(1).optional(),
        graphSnapshotPath: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
```

`buildSynapseRunArtifact` maps from `DevOnceRunRecord` + session + fixture metadata. Reuse `devOnceRunRecordEventSchema` / `devOnceRunRecordAgentRunSchema` from `dev-cli-shared` (do not duplicate event/run shapes).

**`--json` behaviour:** stdout = single `SynapseRunArtifact` JSON only. **Always** write/update graph snapshot under `tmp/dev/runs/<timestamp>_<input_event_id>.json` for webhook runs that received 202 (same as today). Set `files.graphSnapshotPath` and `files.artifactPath` when known.

**Human output** (non-JSON): print manifest name, fixture id, root event id, status, artifact paths, Jaeger URL `http://127.0.0.1:26686`, event list, agent run list (reuse `formatRunRecordFlow` from `dev-cli-shared`).

### Library API

**Package:** `libs/dev-once` (`name`: `dev-once`).

```ts
export type RunSynapseOnceOptions = {
  repoRoot: string;
  /** Resolved from dev session when omitted in CLI mode. */
  manifestPath?: string;
  fixtureId?: string;
  fixturePath?: string;
  devSessionPath?: string;
  timeoutMs?: number;
  pollMs?: number;
  json?: boolean;
};

export async function runSynapseOnce(
  options: RunSynapseOnceOptions,
): Promise<SynapseRunArtifact>;
```

**CLI contract:** `runSynapseOnce` called from `scripts/dev-once.ts` passes `repoRoot` + `fixtureId`/`fixturePath` only; **`manifestPath` must be undefined** — implementation reads `readDevSession(repoRoot).manifest_path`.

**Test lifecycle** — `libs/agent-test-harness`:

```ts
export async function startTestDevServer(input: {
  manifestPath: string;
  repoRoot?: string;
  env?: Record<string, string | undefined>;
}): Promise<{ env: Record<string, string | undefined>; stop(): Promise<void> }>;

export async function withTestDevServer<T>(
  input: { manifestPath: string; repoRoot?: string },
  fn: (dev: { env: Record<string, string | undefined> }) => Promise<T>,
): Promise<T>;
```

**Test contract:** `runDevOnce` **requires** an already-running test server (dev session + webhooks env). It does **not** accept `manifestPath`.

```ts
export type RunDevOnceInput = {
  fixtureId: string;
  repoRoot?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  pollMs?: number;
};

export async function runDevOnce(
  input: RunDevOnceInput,
): Promise<SynapseRunArtifact>;
```

### Fixture resolution

**Export** from `libs/synapse-fixtures`:

```ts
export function listManifestFixtures(
  manifest: RuntimeManifest,
  repoRoot: string,
): Array<{ agent: string; id: string; title: string; path: string }>;

export function resolveFixtureById(
  manifest: RuntimeManifest,
  repoRoot: string,
  fixtureId: string,
): { fixture: SynapseFixture; path: string; agentName: string };
```

`dev:once --list` and interactive picker use `listManifestFixtures` on the manifest from the active dev session.

### Cursor rule

**Create** `.cursor/rules/synapse-run-loop.mdc` with bullets:

- Identify manifest + fixture before changing agent behavior.
- `npm run dev -- --manifest <path>` then `npm run dev:once -- --fixture <id>`.
- Never pass `--manifest` to `dev:once`.
- Tests: `withTestDevServer({ manifestPath })` then `runDevOnce({ fixtureId, env })`.
- Normal Vitest assertions on `SynapseRunArtifact`; no assertion DSL.
- No live external APIs in default tests.
- No new `defineReactor` subscriptions.

### Documentation (shipped scope)

| Action | Path |
| --- | --- |
| Create | `docs/explanation/synapse-run-loop.md` |
| Create | `docs/how-to/run-once-with-fixtures.md` |
| Create | `docs/reference/fixtures.md` |
| Update | `docs/README.md`, `docs/reference/commands.md`, `docs/reference/runtime-manifest.md`, `docs/reference/agents.md`, `docs/how-to/local-agent-development.md`, `docs/how-to/run-and-test-agents.md`, `docs/how-to/create-an-agent.md`, `docs/how-to/create-an-example-agent.md`, `docs/tutorials/local-runtime-example-echo.md`, `docs/tutorials/build-a-fixture-agent.md`, root `README.md`, `agents/README.md`, `examples/agents/README.md`, `apps/webhooks/README.md` |
## End-to-end flows

### Application reviewer (webhook)

```text
npm run dev
  -> manifests/application.json
  -> .synapse/dev-session.json

npm run dev:once -- --fixture review-pr/gitlab-synapse
  -> POST /v1/prs (body from fixtures/.../gitlab-merge-request.json)
  -> pr.received.v1 appended
  -> agent-reviewer handler run
  -> pr.reviewed.v1
  -> SynapseRunArtifact status succeeded
  -> tmp/dev/runs/<ts>_<evt>.json
```

**Observability:** traces ingress → handler; metrics via existing runtime counters; Jaeger link best-effort on artifact.

### Example echo (webhook)

```text
npm run dev -- --manifest manifests/examples/echo.json
npm run dev:once -- --fixture example/echo
  -> POST /v1/examples/echo/ping
  -> example.ping.v1 -> example.pong.v1
```

Tests use `withTestDevServer({ manifestPath: 'manifests/examples/echo.json' })` then `runDevOnce({ fixtureId: 'example/echo', env })`.

## Definition of done (global)

Every task completes only when:

- Zod schemas cover new boundaries; types are `z.infer` only.
- Unit tests for schemas, validation, terminal logic, artifact builder.
- Integration tests: dev session required for CLI; `runDevOnce` for application + echo manifests.
- No live third-party APIs in new tests.
- `npx nx run-many -t lint --all && npx biome check biome.json vitest.config.ts`, typecheck, test, format from repo root.
- Relevant READMEs and docs listed above match behaviour.

## Implementation plan

```text
Task 1 ──► Task 2 ──► Task 3 ──► Task 4 ──► Task 5
```

### Task 1: Rename CLI surface (Phase 1)

**Modify:** root `package.json`, `scripts/dev-webhook.ts` → `scripts/dev-once.ts` (or entry re-export), `scripts/dev.ts` help text, `libs/dev-cli-shared` error strings.

**Deliver:**

- `npm run dev:once` runs current webhook sender logic.
- Reject `--manifest` on `dev:once` with exit 1.
- Missing dev session message references `npm run dev`.

**Acceptance:** Docs smoke: start dev, `dev:once --list` works as today.

**Tests:** `scripts/dev-once/cli.test.ts` — rejects `--manifest`; documents dev-session prerequisite.

### Task 2: Manifest `agents[].fixtures` (Phase 2)

**Modify:** `libs/runtime-manifest/src/manifest-schema.ts`, `validate.ts`, `manifests/application.json`, `manifests/examples/echo.json`, `manifests/examples/all.json`, `scripts/dev.ts` (stop writing `webhooks.fixtures` to session).

**Deliver:** Schema + validation rules above; migrate manifests off `webhooks.fixtures`.

**Tests:** Unit tests for fixture path rules, duplicate ids, agent mismatch.

### Task 3: Fixture files package (Phase 3)

**Create:** `libs/synapse-fixtures/` (`package.json`, `src/fixture-schema.ts`, `src/parse.ts`, `src/list-from-manifest.ts`, `test/unit/*`).

**Deliver:** Convert reviewer + echo to authoritative JSON paths; `parseSynapseFixtureFile`; ingress body file resolution.

**Tests:** Unit round-trip fixtures; invalid ingress fails; webhook `routeSet` mismatch fails.

### Task 4: `dev-once` library + artifact (Phase 4)

**Create:** `libs/dev-once/` (`artifact-schema.ts`, `build-artifact.ts`, `run-synapse-once.ts`, `terminal.ts`).

**Modify:** `scripts/dev-once/*` to call `runSynapseOnce`; webhook POST only; map `SynapseRunArtifact`.

**Modify:** `libs/agent-test-harness` — export `startTestDevServer`, `withTestDevServer`, `runDevOnce`.

**Deliver:** One application integration test and one example test using `runDevOnce` + fixture files.

**Acceptance:** `withTestDevServer({ manifestPath: 'manifests/application.json' }, … runDevOnce({ fixtureId: 'review-pr/gitlab-synapse', env }) …)` returns `status: 'succeeded'` when infra up.

### Task 5: Docs and rules (Phase 5)

**Deliver:** `.cursor/rules/synapse-run-loop.mdc`, `.cursor/rules/current-state-docs.mdc`; product docs use Run Loop terminology only (`npm run dev:once -- --fixture <id>`).

## Future hardening (deferred)

- Inline fixture objects in manifests.
- Fixture JSON Schema for editor tooling (`fixtures/fixture.schema.json`).
- `dev:once` watch mode re-running last fixture on file save.
- Rich assertion DSL or snapshot diff CLI.
- `agent_runs.manifest_path` column in Postgres.

## Non-goals

- Custom assertion DSL or second test framework.
- Manifests containing business logic or handler code.
- Moving event contracts out of `runtime-events`.
- `dev:once` starting Docker, worker, or webhooks.
- `dev:once --manifest` or env override of session manifest.
- Live GitLab/OpenAI calls in default CI tests.
- `direct` fixture ingress (deferred until a webhook route exists).

## Core contract summary

**Synapse Run Loop:** `npm run dev` (or **`startTestDevServer`**) selects the manifest and runs the stack; **`npm run dev:once`** / **`runDevOnce`** send one **fixture** ingress and return a **SynapseRunArtifact** proof. Fixtures live on **`agents[].fixtures`** as webhook JSON validated by **`synapse-fixtures`**. Examples and application agents share one workflow; confidence is the **event flow**, not a single function call.
