# example-agent-sqlite-counter

Curriculum agent: **per-agent SQLite** with a tiny ledger table. Each `example.sqlite.count.requested.v1` upserts a row keyed by `ping_token` and emits `example.sqlite.count.updated.v1` with the running count.

- **Registry name:** `example-sqlite-counter` (must stay a valid SQLite path slug; see `runtime-agent-sqlite`).
- **Ingress:** `triggerSqliteCounterRequest` → `example.sqlite.count.requested.v1`.
- **Worker:** via `manifests/examples/all.json` (or your example manifest).
- **Harness:** `npx nx run example-agent-sqlite-counter:test` emits **two** requests with the same `ping_token` (second chained under the first trace root) so the run artifact shows `count_after` **1** then **2** and proves SQLite persistence across reactor runs.

`src/agent.ts` is what the worker runs; `src/ingress.ts` emits the signal with a **fresh `external_id` per call** so repeated `ping_token` values still append distinct events (Postgres dedupes on `(source, external_id)`).
