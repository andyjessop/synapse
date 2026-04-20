# Synapse Framework

Nx workspace for Synapse, a bare-bones event-driven agentic framework. This repository provides runtime foundations and shared libraries for building reactive, durable AI agents.

## Documentation

Canonical documentation lives in [`docs/`](docs/README.md). New contributors should start with the [local runtime example (echo) tutorial](docs/tutorials/local-runtime-example-echo.md), then [runtime manifest](docs/reference/runtime-manifest.md) and [local agent development](docs/how-to/local-agent-development.md) (`npm run dev`, manifests, `dev:once` fixtures). Agent topology: [docs/reference/agents.md](docs/reference/agents.md). Commands: [docs/reference/commands.md](docs/reference/commands.md).

## Verify locally first

Everything in this repo is designed so you can **prove it works on your machine, with no network**. Run **A** first from the repository root. **B** is the long-lived stack (worker and webhooks). **C** posts manifest-listed fixture JSON contracts to webhooks while **B** is running. Full detail: [local agent development](docs/how-to/local-agent-development.md).

All commands assume you are in the repo root:

### A. Install dependencies

```bash
npm install
```

Run this once (and again after pulling dependency changes). Workspace packages are linked under `node_modules/`.

---

### B. Start the full local stack (recommended)

**One terminal** — infrastructure plus runtime apps:

```bash
npm run dev
```

This runs `docker compose -f local/docker-compose.yml up -d --wait`, checks health with `dev:infra:doctor`, applies **Postgres runtime store migrations**, then starts **worker** and **webhooks** with prefixed logs in the same terminal. You do **not** need to run `dev:infra` first.

Useful variants:

| Command | What starts |
| --- | --- |
| `npm run dev` | Docker infra + Postgres migrations + worker + webhooks |
| `npm run dev:example` | Same as `npm run dev -- --manifest manifests/examples/echo.json` (examples agents + examples webhook routes) |
| `npm run dev -- --manifest <path>` | Load agents and webhooks from a specific manifest JSON |
| `npm run dev:infra` | Docker infra only |
| `npm run dev:infra:doctor` | Reachability check only |

`npm run dev:once` posts run-loop fixture ingress to the running stack (see `apps/webhooks/README.md`); fixture ids come from `agents[].fixtures.webhook` on the manifest you started with **`npm run dev`**. For **`agent-reviewer`**, **`npm run dev`** defaults to **live Pi SDK** plus adapter mock rules from **`fixtures.adapter`** (see `libs/runtime-manifest` schema ids). Set **`AGENT_REVIEWER_HERMETIC=1`** before **`npm run dev`** for a hermetic Pi adapter fixture run. Accepted webhook runs write a graph snapshot under **`tmp/dev/runs/`** (see `apps/webhooks/README.md`).

`dev:infra` alone runs `docker compose -f local/docker-compose.yml up -d --wait` (Postgres 16, Redis 7, OpenTelemetry Collector, Jaeger). Published ports bind to `127.0.0.1` on the host only. They use **non-default host ports** so this stack can run beside other local instances:

| Service | Host port | Container port |
| --- | --- | --- |
| Postgres | 25432 | 5432 |
| Redis | 26379 | 6379 |
| OTLP (gRPC) | 24317 | 4317 |
| OTLP (HTTP) | 24318 | 4318 |
| OTel collector health | 21333 | 13133 |
| Jaeger UI | 26686 | 16686 |

`dev:infra:doctor` checks process reachability. Code defaults point at the host ports above, so the happy local path needs **no `.env.local` at all**.

Other infra commands:

```bash
npm run dev:infra:down          # stop containers, keep volumes
npm run dev:infra:reset         # stop containers and delete volumes
```

**GitLab MR** ingress is available while **`npm run dev`** is up (`npm run dev:once -- --fixture review-pr/gitlab-synapse`, or `POST` manually). **Example echo** HTTP ingress is available while **`npm run dev:example`** is up (`npm run dev:once -- --fixture example/echo`). Webhooks listen on `http://127.0.0.1:3102` by default — see `apps/webhooks/README.md`.

**Inspect durable state** whenever Postgres from the table above is reachable (for example while **B** is running, or after `dev:once` fixture runs in **C**):

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

---

### C. Webhook fixture sender (requires **B**)

With **`npm run dev`** (or **`npm run dev:example`**) already running, use a **second terminal** to POST manifest fixtures to **`apps/webhooks`** and print follow-up (event chain, flow, links). Same playbook: [local agent development](docs/how-to/local-agent-development.md), `apps/webhooks/README.md`.

```bash
npm run dev:once -- --list
npm run dev:once -- --fixture review-pr/gitlab-synapse

# after npm run dev:example (or dev -- --manifest manifests/examples/…)
npm run dev:once -- --fixture example/echo
```

Fixture ids in `--list` follow the manifest written to `.synapse/dev-session.json` when dev started.

The SQL queries under **B** apply here too once events exist.

#### Review agent scenario (local)

```bash
npm run dev:once -- --fixture review-pr/gitlab-synapse
```

This posts the GitLab MR fixture to **`POST /v1/prs`** and follows durable state in Postgres. For **live Pi SDK** review of your checkout (default `openai/gpt-5.4-mini`), set `OPENAI_API_KEY` in repo-root `.env.local` (see `agents/agent-reviewer/README.md`).

### D. Hermetic CI-style verification (no Docker)

From the repo root:

```bash
npm install
npx nx run-many -t lint --all && npx biome check biome.json vitest.config.ts
npx nx run-many -t typecheck --all
npx nx run-many -t test --all
```

To apply formatting:

```bash
npx nx run-many -t format --all && npx biome format --write biome.json vitest.config.ts
```

---

## Workspace layout

- `apps/worker`: RxJS planning/queueing/repair loops plus BullMQ execution for durable `agent_runs`.
- `libs/runtime-*`: Reusable runtime foundations (config, event contracts, stream worker helpers, store schema). Platform lifecycle is owned by the `runtime` event owner; capability agents are explicit packages registered on the worker.
- `tsconfig.json` — shared TypeScript program used by each package’s `typecheck` script (`tsc --noEmit -p ../../tsconfig.json`).

Each workspace package declares a `name` in its `package.json`; Nx uses that string as the project id. All npm dependencies are declared **only** in the root `package.json`.
