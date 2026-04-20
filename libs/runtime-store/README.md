# `runtime-store`

Postgres-backed durable truth for the streams runtime.

The current storage contract is intentionally small: `events` and `agent_runs`
are the only active runtime tables used by worker and ingress. Capture rows,
projections, ingress cursors, outbox attempts, `event_outbox`, trace columns,
and the old CloudEvents envelope schema are removed from the active runtime.

## Core APIs

- `createRuntimeStorePool({ databaseUrl })` creates the process pool.
- `migrateRuntimeStore(pool)` applies versioned ledger migrations before any
  worker or ingress work starts.
- `createRuntimeStore(pool)` returns the spec `RuntimeStore` API:
  `appendEvent`, `loadEventsForPlanning`, `ensureAgentRun`,
  `loadPendingRuns`, `markRunQueued`, `claimRun`, `markRunSucceeded`,
  `markRunFailed`, `repairStaleRuns`, and `loadEvent`.

`appendEvent` is atomic and idempotent: duplicate `(source, externalId)` inputs
return the existing event. Event **`data`** is stored **inline in Postgres**
(JSONB, ≤ **1 MiB** per event).

For local HTTP ingress, **`apps/webhooks`** writes one pretty-printed run snapshot
per accepted request under **`<repoRoot>/tmp/dev/runs/<YYYYMMDDHHmmss>_<input_event_id>.json`**
(events, agent runs, and hydrated payloads). That directory is the dev inspection
log; it is not a second persistence layer for the runtime.

## Schema

The stream baseline migration is
`libs/runtime-store/drizzle/ledger/001_streams_runtime.sql`. It drops obsolete
runtime tables and creates:

- `events` with runtime-generated `evt_<opaque-random>` ids and unique
  `(source, external_id)`.
- `agent_runs` with deterministic
  `run_<event_id>__<agent_name>__<reactor_name>` ids and statuses limited to
  `pending`, `queued`, `running`, `succeeded`, and `failed`.

## Verify

From the repository root:

```bash
npx nx run runtime-store:lint
npx nx run runtime-store:typecheck
npx nx run runtime-store:test
```
