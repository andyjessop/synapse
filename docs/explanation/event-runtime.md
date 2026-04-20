---
title: Event runtime
kind: explanation
owner: runtime
status: current
updated: 2026-05-19
freshness_triggers:
  - libs/runtime-worker/**
  - apps/worker/**
---

# Event runtime

## Purpose

Synapse is a local-first event runtime for durable, observable agents. External systems, local scripts, and developer fixtures enter through app or agent ingress code, become validated semantic events, persist in Postgres, and trigger BullMQ-backed handler runs.

When the runtime is healthy, a developer can start local infra, run the worker, emit a fixture event, observe the resulting `events` and `agent_runs` rows in Postgres, and open traces in Jaeger without production credentials.

## Mental Model

### Runtime loop

```text
External webhook, CLI, fixture, or adapter poll
  |
  v
App entrypoint or agent ingress
  | validate external input with Zod
  v
runtime-worker ingress ctx.emit(...)
  | validate event type + payload
  v
runtime-store Postgres transaction
  | append events row
  v
apps/worker stream supervisors + BullMQ
  | planning creates agent_runs; queueing enqueues reactor.run jobs; repair heals stale rows
  v
Redis + BullMQ queue
  | job payload { runId }; deterministic job id per event/agent/reactor
  v
Reactor handler
  | capability logic, adapters, ctx.emit(...)
  v
Follow-up event re-enters Postgres
```

The runtime deliberately keeps the spine small:

- **Postgres is memory.** It stores the semantic event log and reactor run records.
- **BullMQ is execution.** It provides queueing, retries, attempts, and worker concurrency on top of Redis.
- **OpenTelemetry explains execution.** Traces, metrics, and structured logs explain runtime behavior without turning every internal step into an event.
- **Agents own behavior.** Agents own event contracts and reactor behavior; adapters own external I/O.

### Core technologies

| Technology | Where | Runtime role |
| --- | --- | --- |
| Node.js 22 + TypeScript + ESM | Whole repo | Runtime language and module format |
| Nx | Workspace commands | Runs package targets and repo verification |
| Zod | Boundaries and events | Validates env, webhook bodies, event payloads, adapter config, and emit options |
| Event registry | `runtime-events` | Event type, owner, category, topic, and payload-schema contracts |
| Postgres 16 | `runtime-store` | Durable `events` and `agent_runs` storage |
| Redis 7 | `apps/worker` | BullMQ backing store |
| BullMQ | `runtime-worker` | Reactor queueing and execution dispatch |
| OpenTelemetry + Jaeger | `runtime-observability`, local OTel collector | Spans, trace propagation, metrics, and local trace inspection |
| Hono + Zod OpenAPI | `apps/webhooks` | HTTP webhook ingress |
| Vercel AI SDK | `runtime-llm` | Approved boundary for application LLM calls |

## How It Works

### Event contracts

`runtime-events` is the authoritative event contract package. It owns:

- `eventRegistry`, keyed by lowercase dotted event type names such as `example.ping.v1`.
- Event categories: `signal`, `intent`, `outcome`, and `lifecycle`.
- Event owners, used for documentation and observability metadata.
- Zod payload validation through `validateEventData(type, data)`.
- Topic helpers such as `example.ping.v1` to `example/ping/v1`.

`runtime-events` does not own the durable event row shape, CloudEvents envelope validation, outbox state, runtime row mapping, or trace persistence. Active runtime event objects use the `runtime-agent.SynapseEvent` shape:

```ts
type SynapseEvent<TData = unknown> = {
  id: string;
  type: string;
  source: string;
  externalId: string;
  subject?: string;
  data: TData;
  rootId: string;
  parentId?: string;
  createdAt: string;
};
```

Unsupported envelope fields such as `correlationid`, `causationid`, `traceparent`, and `tracestate` are not accepted as persisted event fields. Trace context lives in OpenTelemetry and runtime logs, not in the `events` table.

### Ingress and emit

Ingress helpers live in `runtime-worker`. App entrypoints, scripts, webhooks, and polling loops create an ingress context with:

- `agent`: the agent or app capability emitting the event.
- `source`: a stable URI-like source string.
- `store`: the Postgres pool.
- Optional adapters, agent clients, and tracer.

`ctx.emit(type, data, options)` validates the event payload at the store boundary and appends a row to `events` in one transaction. Idempotency is based on `source + external_id`, so retrying the same external input returns the existing event instead of duplicating it.

### Worker streams

`apps/worker` runs three plain interval supervisors from `runtime-worker`:

- **Planning** reads unplanned events, matches reactors from the runtime registry, and creates `agent_runs`.
- **Queueing** reads pending runs and enqueues BullMQ `reactor.run` jobs with deterministic job IDs.
- **Repair** moves stale queued/running rows back to `pending` so they can be retried.

There is no event relay and no `event_outbox` table. Worker planning reads directly from `events`.

### Storage

`runtime-store` owns raw SQL migrations and Postgres access. The active runtime tables are:

- `runtime_store_migrations`: applied migration ledger.
- `events`: durable semantic event log.
- `agent_runs`: reactor execution records and failure detail.

The store no longer uses Drizzle, generated schema files, capture tables, projection tables, trace columns, or file-backed event payload pointers.

## Boundaries

Semantic events and observability are separate:

- **Events** are durable product/runtime facts that another reactor may consume.
- **Traces** explain execution paths through ingress, store append, queueing, and reactor execution.
- **Metrics** answer operational questions about counts, duration, lag, and outcomes.
- **Logs** carry structured failure and lifecycle details.

Use `runtime-observability` helpers for spans, trace propagation, metrics, and structured log fields. Do not promote helper calls, queue internals, SQL statements, or trace metadata into semantic events unless another agent or operator needs them as durable history.

Adapters perform external IO; agents decide when to call them. Manifest JSON declares which agents handle which event types ([Runtime manifest](runtime-manifest.md)).

## Trade-Offs

Postgres durability and BullMQ execution favor at-least-once delivery and explicit repair over exactly-once magic. That keeps the spine understandable locally at the cost of idempotent handlers and careful side-effect policy.

## Related Reference

- [Runtime manifest](runtime-manifest.md)
- [Event contracts](../reference/event-contracts.md)
- [Storage schema](../reference/storage-schema.md)
- [Observability](../reference/observability.md)
- [Commands](../reference/commands.md)

## Local Verification

Run workspace checks from the repo root:

```sh
npx nx run-many -t lint --all
npx nx run-many -t typecheck --all
npx nx run-many -t test --all
```

For local runtime behavior, start infra and the worker, emit a fixture through a webhook or ingress script, then inspect Postgres `events` and `agent_runs` plus Jaeger traces.
