---
title: Environment
kind: reference
owner: runtime
status: current
updated: 2026-05-20
freshness_triggers:
  - libs/runtime-config/**
  - libs/runtime-agent-sqlite/**
  - scripts/dev.ts
  - manifests/**
  - local/docker-compose.yml
---

# Environment

## Scope

Environment variables, defaults, and local infrastructure host ports.

## Contract

Configuration is parsed through `parseRuntimeConfig` in `libs/runtime-config` unless noted. Local defaults require no `.env.local` for the happy path.

## Details

### Runtime (`runtime-config`)

| Variable | Default |
| --- | --- |
| `DATABASE_URL` | `postgresql://synapse:synapse@127.0.0.1:25432/synapse` |
| `REDIS_URL` | `redis://127.0.0.1:26379` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://127.0.0.1:24318` |
| `OTEL_COLLECTOR_HEALTH_URL` | `http://127.0.0.1:21333/` |
| `JAEGER_UI_URL` | `http://127.0.0.1:26686` |
| `SYNAPSE_FIXTURE_MODE` | `auto` (`on` / `off` valid) |
| `OPENAI_API_KEY` | optional; **required** for default OpenAI models in Pi SDK live review unless keys exist in `~/.pi/agent/auth.json` |

Fixture OpenAI mode is on when `SYNAPSE_FIXTURE_MODE=on`, or `auto` without an API key.

### Local Docker host ports

| Service | Host port |
| --- | --- |
| Postgres | 25432 |
| Redis | 26379 |
| OTLP gRPC | 24317 |
| OTLP HTTP | 24318 |
| OTel collector health | 21333 |
| Jaeger UI | 26686 |

### Manifest and dev session

| Variable | Default / behavior |
| --- | --- |
| `SYNAPSE_RUNTIME_MANIFEST` | Unset → `manifests/application.json` when using `npm run dev`; `apps/webhooks` reads `webhooks.routes` from this file |
| `--manifest <path>` | CLI override on `npm run dev` (repo-relative or absolute) |
| Dev session file | `.synapse/dev-session.json` — written by `npm run dev`; read by `npm run dev:once` |

**Deprecated as primary switches:** `SYNAPSE_WORKER_AGENT_SET` — use a manifest instead. Example agents load when listed in `manifests/examples/*.json`, not via `examples` env alone.

See [Runtime manifest](runtime-manifest.md).

### `worker` (additional)

| Variable | Default |
| --- | --- |
| `WORKER_INSTANCE_ID` | hostname or generated id |
| `SYNAPSE_DEV_FAIL_REACTOR` | unset |
| `SYNAPSE_DEV_DEAD_LETTER_REACTOR` | unset |
| `AGENT_REVIEWER_HERMETIC` | unset by default. When **`1`**, **`true`**, or **`yes`**, **`agent-reviewer`** uses fixture Pi markdown from manifest **`adapterFixtures.piReview`** (no OpenAI). |
| `AGENT_REVIEWER_PI_MODE` | unset → **live** Pi SDK. Set to **`fixture`** or **`process`** to override mode; ignored when **`AGENT_REVIEWER_HERMETIC`** is set. Adapter stub paths come from manifest **`agents[].adapterFixtures`**, not env. |
| `PI_REVIEW_MODEL` | `openai/gpt-5.4-mini` when unset (Pi SDK live path); format `provider/model-id` |
| `PI_HARNESS_PROGRESS` | unset by default. When **`1`**, **`[pi-harness]`** lines describe **tools with paths/patterns** (repo-relative when `repoRoot` is known), throttled **thinking** snippets, and **tool failures** only (no full prompts or file contents). Tools may write **`SYNAPSE_PI_HARNESS_PROGRESS_SNAPSHOT`** under `STATE_DIR` as `pi-harness-progress.json` (atomic JSON `{ "lines": string[] }`) for UIs that want last activity lines without stderr noise. Set **`PI_HARNESS_PROGRESS=stderr`** to print lines to the worker’s stderr instead. Set to **`0` / `false` / `no` / `off`** to disable. |
| `SYNAPSE_DEV_ONCE_INHERIT_CHILD_STDERR` | unset by default; when set, child stderr from dev processes is inherited. Prefer **`PI_HARNESS_PROGRESS`** and normal child stdio wiring from **`npm run dev`**. |
| `SYNAPSE_PI_HARNESS_PROGRESS_SNAPSHOT` | unset unless a tool writes it under `STATE_DIR` (see `PI_HARNESS_PROGRESS`). |
| `DEV_ONCE_MAX_WAIT_MS` | unset — `npm run dev:once` polls until a terminal event or failed run (no default cap). Set for scripts/CI that need a bounded wait. |
| `DEV_ONCE_POLL_MS` | `500` — poll interval while `dev:once` waits for terminal events |
| `SYNAPSE_AGENT_SQLITE_DIR` | unset → `<repoRoot>/.synapse/agent-sqlite` (resolved at worker startup via `getRepoRoot`); may be absolute or repo-relative |
| `SYNAPSE_AGENT_SQLITE_ADVISORY_LOCK_TIMEOUT_MS` | `30000` — bounded wait for `pg_try_advisory_lock` around SQLite open+migrate |
| `SYNAPSE_AGENT_SQLITE_MIGRATION_MAX_MS` | `300000` — per-migration wall-clock ceiling (checked around each migration `exec`) |

Example agents with `sqlite` use the same SQLite variables when their **manifest** lists them (e.g. `manifests/examples/all.json`).

**Secrets:** do not commit API keys. Use **repo-root `.env.local`** (gitignored) for `OPENAI_API_KEY` and other credentials; **`scripts/dev.ts`** merges `.env.local` into spawned children via `loadDotEnvLocal`.

## Examples

```bash
export SYNAPSE_RUNTIME_MANIFEST=manifests/debug/reviewer-only.json
npm run dev

export AGENT_REVIEWER_HERMETIC=1
```

## Related Pages

- [Runtime manifest](runtime-manifest.md)
- [Run local infrastructure](../how-to/run-local-infrastructure.md)
- [Commands](commands.md)
