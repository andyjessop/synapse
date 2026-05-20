---
title: Environment
kind: reference
owner: runtime
status: current
updated: 2026-05-21
freshness_triggers:
  - libs/runtime-config/**
  - libs/runtime-agent-sqlite/**
  - scripts/dev.ts
  - manifests/**
  - scenarios/**
  - agents/agent-reviewer/**
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
| `SYNAPSE_RUNTIME_MANIFEST` | Unset → `manifests/application.json` when using `npm run dev`; ingress reads mounts from this file |
| `--manifest <path>` | CLI override on `npm run dev` and `npm run dev:once` (repo-relative or absolute) |
| `SYNAPSE_DEV_KILL_ORPHANS` | When `1` / `true`, `npm run dev` stops existing worker/ingress/adapters processes without prompting |
| Default manifest | `manifests/application.json` (`application-default`) for `npm run dev` and `npm run dev:once`; override with `--manifest` on either command |

**`SYNAPSE_WORKER_AGENT_SET`** is not the primary agent switch — use a manifest. Example agents load when listed in `manifests/examples/*.json`.

See [Runtime manifest](runtime-manifest.md).

### `worker` (additional)

| Variable | Default |
| --- | --- |
| `WORKER_INSTANCE_ID` | hostname or generated id |
| `SYNAPSE_DEV_FAIL_REACTOR` | unset |
| `SYNAPSE_DEV_DEAD_LETTER_REACTOR` | unset |
| `AGENT_REVIEWER_HERMETIC` | unset by default. When **`1`**, **`true`**, or **`yes`**, **`agent-reviewer`** uses Pi **fixture** mode (pi-harness JSON, no OpenAI). |
| `AGENT_REVIEWER_PI_MODE` | unset → **live** Pi SDK. Set to **`fixture`** or **`process`** to override; ignored when **`AGENT_REVIEWER_HERMETIC`** is set. |
| `PI_REVIEW_MODEL` | `openai/gpt-5.4-mini` when unset (Pi SDK live path); format `provider/model-id` |
| `PI_HARNESS_PROGRESS` | unset by default. When **`1`**, **`[pi-harness]`** lines describe tools with paths/patterns (repo-relative when `repoRoot` is known), throttled thinking snippets, and tool failures only. Set **`SYNAPSE_PI_HARNESS_PROGRESS_SNAPSHOT`** to a repo path for a rolling JSON snapshot. Set **`PI_HARNESS_PROGRESS=stderr`** to print to worker stderr. Set **`0` / `false` / `no` / `off`** to disable. |
| `SYNAPSE_DEV_DEBUG_WORKER` | unset. When **`1`** or **`true`**, **`npm run dev`** starts the worker with Node inspect (port **`9230`** by default). |
| `SYNAPSE_DEV_DEBUG_WORKER_PORT` | **`9230`** when worker debug is on |
| `SYNAPSE_DEV_ONCE_INHERIT_CHILD_STDERR` | unset by default |
| `SYNAPSE_PI_HARNESS_PROGRESS_SNAPSHOT` | unset unless set to a path for rolling progress lines |
| `DEV_ONCE_MAX_WAIT_MS` | unset — `dev:once` polls until terminal state or failed run |
| `DEV_ONCE_POLL_MS` | `500` |
| `SYNAPSE_AGENT_SQLITE_DIR` | unset → `<repoRoot>/tmp/dev/agent-sqlite` |
| `SYNAPSE_AGENT_SQLITE_ADVISORY_LOCK_TIMEOUT_MS` | `30000` |
| `SYNAPSE_AGENT_SQLITE_MIGRATION_MAX_MS` | `300000` |
| `GITLAB_TOKEN` | optional; required for live GitLab adapter deps in `apps/adapters` |
| `GITLAB_BASE_URL` | optional GitLab API base |
| `ADAPTERS_BASE_URL` | worker → adapters HTTP RPC base (set by dev scripts when adapters app runs) |

**Scenario adapter mocks** for `dev:once` come from scenario JSON (`adapters[]`), not manifest env. **`AGENT_REVIEWER_HERMETIC`** controls Pi only.

Example agents with `sqlite` use the same SQLite variables when their **manifest** lists them.

**Secrets:** use repo-root **`.env.local`** (gitignored); **`scripts/dev.ts`** merges it into spawned children.

## Examples

```bash
export SYNAPSE_RUNTIME_MANIFEST=manifests/debug/reviewer-only.json
npm run dev

export AGENT_REVIEWER_HERMETIC=1
npm run dev
npm run dev:once -- --scenario review-pr/gitlab-synapse
```

## Related Pages

- [Runtime manifest](runtime-manifest.md)
- [Local agent development](../how-to/local-agent-development.md)
- `agents/agent-reviewer/README.md`
