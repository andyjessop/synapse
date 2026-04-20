---
title: Storage schema
kind: reference
owner: runtime-store
status: current
updated: 2026-05-19
freshness_triggers:
  - libs/runtime-store/**
---

# Storage schema

## Scope

Postgres tables owned by `runtime-store`.

## Contract

Source: `libs/runtime-store/src/schema.ts` and migrations.

## Details

| Table | Purpose |
| --- | --- |
| `runtime_store_migrations` | Applied migration ids |
| `events` | Append-only semantic event log |
| `agent_runs` | Reactor/job execution records |

Obsolete outbox, capture, cursor, projection, and trace-context tables/columns are dropped by runtime-store migrations.

## Examples

```sql
select id, type, created_at from events order by created_at desc limit 5;
```

## Related Pages

- [Event runtime](../explanation/event-runtime.md)
