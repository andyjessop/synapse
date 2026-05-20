# dev-cli-shared

Shared helpers for local dev CLIs: run graph snapshots, wait/poll loops, and terminal formatting.

## Run graph event limit

`gatherDevOnceRunRecord` and `createRootGraphObserver` load at most **`DEV_RUN_GRAPH_EVENT_LIMIT` (500)** events per root from Postgres. `dev:once` prints the graph live during the run; it does not repeat the tree at the end. `--no-wait` / `--json` skip live lines; non-live runs print flat Events and Agent runs lists instead. Use `tmp/dev/runs/<timestamp>_<event_id>.json` or SQL for full history.
