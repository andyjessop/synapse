# dev-cli-shared

Shared helpers for local dev CLIs: run graph snapshots, wait/poll loops, and terminal formatting.

## Run graph event limit

`gatherDevOnceRunRecord`, `createRootGraphObserver`, and final **Flow** output all load at most **`DEV_RUN_GRAPH_EVENT_LIMIT` (500)** events per root from Postgres. Larger graphs are truncated consistently across live lines and the post-run tree; use `tmp/dev/runs/<timestamp>_<event_id>.json` or SQL for full history.
