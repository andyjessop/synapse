# example-agent-sqlite-notebook

Curriculum agent: **SQLite-backed append-only notes**. `example.sqlite.note.append.v1` inserts a row and emits `example.sqlite.note.stored.v1` with `note_id`, `subject`, and `char_count`.

- **Registry name:** `example-sqlite-notebook`.
- **Ingress:** `triggerSqliteNotebookAppend` → `example.sqlite.note.append.v1`.
- **Local run:** `npx nx run example-agent-sqlite-notebook:test` (or add `examples/fixtures/.../sqlite-notebook.fixture.json` on `agents[].fixtures` + webhooks route when HTTP is wired).

`src/agent.ts` is what the worker runs; `src/ingress.ts` only emits the first signal.
