---
title: Observability
kind: reference
owner: runtime-observability
status: current
updated: 2026-05-16
freshness_triggers:
  - libs/runtime-observability/**
---

# Observability

## Scope

Span names, metric families, and structured log conventions.

## Contract

Source: `libs/runtime-observability`. Use `runWithRuntimeSpan` for runtime hops. Metric labels must stay low-cardinality (no event IDs, trace IDs, or raw URLs as labels).

## Details

### Runtime hops → span names

| Hop | Span name |
| --- | --- |
| `ingress.emit` | ingress emit |
| `event.validate` | event validate |
| `event.append` | event append |
| `outbox.enqueue` | outbox enqueue |
| `outbox.claim` | outbox claim |
| `bullmq.enqueue` | bullmq enqueue |
| `bullmq.process` | bullmq process |
| `reactor.run` | reactor run |
| `reactor.emit` | reactor emit |
| `adapter.request` | adapter request |

### Metric instrument names

- `synapse.events.recorded`
- `synapse.outbox.operations`
- `synapse.bullmq.jobs`
- `synapse.adapter.requests`
- `synapse.agent.runs`

Label builders: `buildEventMetricLabels`, `buildOutboxMetricLabels`, `buildBullmqMetricLabels`, `buildAdapterMetricLabels`, `buildAgentRunMetricLabels`.

Structured logs use `buildRuntimeLogFields` with trace/span IDs. Audit context via `runtimeSpanAuditContext()` inside spans.

## Examples

```ts
await runWithRuntimeSpan({ hop: 'reactor.run', tracer, operation: 'example-ping', run: async () => { ... } });
```

## Related Pages

- [Observability model](../explanation/observability-model.md)
- [Debug with traces](../how-to/debug-with-traces.md)
