# `worker`

Starts the durable streams worker.

It runs migrations, builds the explicit
agent registry, starts three RxJS reconciliation loops, and starts a BullMQ
worker for `reactor-runs`:

- `planning$` scans recent Postgres `events` and ensures matching
  `agent_runs` rows.
- `queueing$` turns `pending` runs into BullMQ `reactor.run` jobs containing
  only `{ runId }`.
- `repair$` resets stale `queued` rows and expired `running` rows back to
  `pending`.

BullMQ execution claims the durable run before loading event data or invoking a
reactor. While a handler runs, the worker **renews** the Postgres run lease on a
fixed interval so crash recovery (`repair$`) does not treat healthy long work as
stale. Duplicate jobs for succeeded or otherwise unclaimable runs are skipped.

Reactor handlers and Pi reviews are **not** capped by a wall-clock work timeout;
progress and outcomes come from `agent_runs` rows and semantic events.

Agents with `sqlite` definitions use an agent-local SQLite file under
`SYNAPSE_AGENT_SQLITE_DIR` (default `<repoRoot>/.synapse/agent-sqlite`), opened
with a Postgres advisory lock for cross-process migration safety. Shutdown
stops the BullMQ worker first, then closes cached SQLite handles (only after
in-flight reactor jobs finish, so a late open cannot repopulate the cache after
that close pass) before the store pool ends.

## Run

From the repository root:

```bash
npx nx run worker:start
```

Requires `DATABASE_URL` and `REDIS_URL` from `runtime-config`.

## Registered agents (manifest)

Agents load from a runtime manifest JSON file (default `manifests/application.json`).

- Override: `SYNAPSE_RUNTIME_MANIFEST` or `npm run dev -- --manifest <path>`
- Startup prints: `synapse manifest: <absolute path>`
- Wiring: `apps/worker/src/manifest-registry.ts` validates the manifest, resolves default-exported handler modules, and builds the runtime registry.

Examples: `npm run dev -- --manifest manifests/examples/echo.json` (see `libs/runtime-manifest/README.md`).

See [docs/reference/agents.md](../../docs/reference/agents.md).
