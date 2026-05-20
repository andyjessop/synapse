---
title: Architecture overview
kind: explanation
owner: runtime
status: current
updated: 2026-05-16
freshness_triggers:
  - apps/**
  - libs/runtime-*
---

# Architecture overview

## Purpose

Synapse is an event-driven agentic runtime: external signals become durable semantic events, broadcast work executes reactors, and observability explains outcomes locally.

## Mental Model

```text
External systems or local fixtures
  │
  ▼
Adapters and app entrypoints
  │
  ▼
runtime-worker ingress
  │
  ▼
runtime-store events + outbox (append completes outbox in the same transaction)
  │
  ▼
worker streams enqueue BullMQ jobs
  │
  ▼
agent reactors emit follow-up events or call adapters
```

## How It Works

- **Apps** (`worker`, `ingress`) are runnable processes.
- **Libs** (`runtime-*`, `pi`) are shared foundations and contracts.
- **Agents** own capability behavior and event ownership.
- **Adapters** own external I/O boundaries.
- **Postgres** is durable memory for events and agent runs.
- **BullMQ** executes reactor work.

## Boundaries

- Adapters adapt the outside world; agents decide when and why.
- Semantic events are not the same as traces, metrics, or logs.
- `specs/` plans implementation; `docs/` describes shipped behavior.

## Trade-Offs

- Local-first defaults favor fast feedback over production multi-tenancy in v1.
- Explicit worker registration keeps v1 simple versus a dynamic agent loader.

## Related Reference

- [Package map](../reference/package-map.md)
- [Workspace layout](../reference/workspace-layout.md)
- [Event runtime](event-runtime.md)
