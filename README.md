# Synapse Framework

Nx workspace for Synapse, a bare-bones event-driven agentic framework. This repository provides runtime foundations and shared libraries for building reactive, durable AI agents.

## Goals

- **Local-first** — run the full loop on your machine with Docker and fixtures; no cloud or vendor credentials required for the default path.
- **Simple commands** — `npm install`, `npm run dev`, `npm run dev:once:clean` cover the usual day-to-day workflow from the repo root.
- **Scenario-driven development** — **declarative** fixtures in `scenarios/`; **`dev:once`** to run them; **observable** via the CLI summary and `tmp/dev/runs/` graph snapshots (reused in hermetic tests).
- **Durable and observable** — events and agent runs live in Postgres; traces and metrics go to local Jaeger/OTel when the stack is up.

Agents react to **events**; adapters handle external IO; the runtime owns storage, queues, and delivery.

## Documentation

Canonical documentation lives in [`docs/`](docs/README.md). New contributors should start with the [local runtime example (echo) tutorial](docs/tutorials/local-runtime-example-echo.md), then [runtime manifest](docs/reference/runtime-manifest.md) and [local agent development](docs/how-to/local-agent-development.md).

## Local usage

All commands run from the **repository root** in two terminals.

### 1. Install dependencies

```bash
npm install
```

Downloads and links workspace packages. Run once after clone, and again when `package.json` dependencies change.

### 2. Start the stack (terminal 1)

```bash
npm run dev
```

Starts local infrastructure (Docker: Postgres, Redis, observability), applies database migrations, then runs the **worker** and **ingress** (webhooks on `http://127.0.0.1:3102`). Default manifest is `manifests/application.json` (includes `agent-reviewer` and GitLab MR ingress).

Leave this terminal running while you work. Startup prints which manifest loaded.

### 3. Run a scenario (terminal 2)

With `npm run dev` still running:

```bash
npm run dev:once:clean
```

**`dev:once:clean`** runs one test ingress payload (from `scenarios/`), waits for agents to finish, and prints a short summary. **`--scenario`** picks which fixture to run.

**`--fixture`** is the same as **`--scenario`**.

---

## Why `dev:once:clean`

A normal `dev:once` run leaves prior events in Postgres. Webhooks often dedupe on the same `source` + `external_id`, so a second run can replay an old terminal result instead of executing agents again.

**`dev:once:clean`** clears that state first, then runs the scenario.

1. Truncates loopback Postgres runtime tables (`events`, `agent_runs`)
2. Drains the BullMQ reactor queue
3. Clears a stale adapter scenario binding if a previous `dev:once` was interrupted
4. Posts the scenario to ingress and waits for the run to finish

Use **`dev:once:clean`** when you want a **fresh** agent run every time. Use plain **`dev:once`** when you only need to inspect or re-wait on existing durable state.

---

## Output and how to verify an agent worked

While the run executes, the terminal prints a live **event / agent graph** (types, agent names, status glyphs).

When it finishes, you should see something like:

```text
Synapse Run Loop
manifest: application
scenario: review-pr/gitlab-synapse
root event: evt_…
status: succeeded
artifact: tmp/dev/runs/20260521194449_evt_….json
```

| Check | Good sign |
| --- | --- |
| Exit code | `0` |
| `status:` | `succeeded` |
| `artifact:` line | Path to a new file under `tmp/dev/runs/` |

Open the **artifact** JSON (pretty-print or `jq`) for the full graph:

| Field | What to look for |
| --- | --- |
| `events` | Chain from the input event through follow-up types (not a single isolated event) |
| `agentRuns` | At least one run for your agent (e.g. `agent-reviewer`) with `"status": "succeeded"` |
| `lastError` | Should be absent on agent runs |

For **`review-pr/gitlab-synapse`**: input is a GitLab MR webhook (`pr.received.v1`); expect downstream review events and a succeeded **`agent-reviewer`** run. Live Pi review needs `OPENAI_API_KEY` in repo-root `.env.local` unless you set `AGENT_REVIEWER_HERMETIC=1` on `npm run dev` (see `agents/agent-reviewer/README.md`).

**Example echo** (no application agents): start with `npm run dev:example`, then:

```bash
npm run dev:once:clean -- --manifest manifests/examples/echo.json --scenario example/echo
```

Expect `example-echo` succeeded and `example.pong.v1` in the event chain.

More detail: [local agent development](docs/how-to/local-agent-development.md), `apps/ingress/README.md`, `libs/dev-cli-shared/README.md`.

---

## Other commands

| Command | Purpose |
| --- | --- |
| `npm run dev:once -- --list` | Scenarios for the manifest (default `application.json`) |
| `npm run dev:once -- --scenario <id>` | Run without wiping Postgres first |
| `npm run dev -- --manifest <path>` | Load different agents / webhooks |
| `npm run dev:example` | `dev` with `manifests/examples/echo.json` |
| `npm run dev:infra` | Docker only (Postgres, Redis, Jaeger) |
| `npm run dev:infra:down` | Stop containers, keep volumes |
| `npm run dev:infra:reset` | Stop containers and delete volumes |

### Infrastructure ports

`npm run dev` starts Docker on loopback-only host ports (no `.env.local` required for defaults):

| Service | Host port |
| --- | --- |
| Postgres | 25432 |
| Redis | 26379 |
| Jaeger UI | 26686 |

### Inspect Postgres directly

```sql
select id, type, source, external_id, root_id, parent_id
from events
order by created_at desc
limit 20;

select id, input_event_id, agent_name, reactor_name, status, attempt_count
from agent_runs
order by created_at desc
limit 20;
```

### CI-style verification (no Docker)

```bash
npm install
npx nx run-many -t lint --all && npx biome check biome.json vitest.config.ts
npx nx run-many -t typecheck --all
npx nx run-many -t test --all
```

Formatting: `npx nx run-many -t format --all && npx biome format --write biome.json vitest.config.ts`

---

## Workspace layout

- `apps/worker`: RxJS planning/queueing/repair loops plus BullMQ execution for durable `agent_runs`.
- `libs/runtime-*`: Reusable runtime foundations (config, event contracts, stream worker helpers, store schema). Platform lifecycle is owned by the `runtime` event owner; capability agents are explicit packages registered on the worker.
- `tsconfig.json` — shared TypeScript program used by each package’s `typecheck` script (`tsc --noEmit -p ../../tsconfig.json`).

Each workspace package declares a `name` in its `package.json`; Nx uses that string as the project id. All npm dependencies are declared **only** in the root `package.json`.
