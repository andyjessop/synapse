---
title: Observability model
kind: explanation
owner: runtime-observability
status: current
updated: 2026-05-19
freshness_triggers:
  - libs/runtime-observability/**
---

# Observability model

## Purpose

Separate channels so operators debug without polluting the semantic event log.

## Mental Model

| Channel | Stores | Answers |
| --- | --- | --- |
| Semantic events | Postgres `events` | What happened in the product/runtime history? |
| Traces | OpenTelemetry / Jaeger | How did this execution path run? |
| Metrics | OTel counters | Rates, outcomes, lag (low-cardinality labels) |
| Logs | Structured fields | Debug detail with trace/span IDs |
| Audit | Durable run rows | Operational records inside spans |

## How It Works

Use `runWithRuntimeSpan` for I/O and orchestration hops. Record metrics via `RuntimeMetrics` families. Use `buildRuntimeLogFields` for structured logs. Trace boundaries such as `event.append`, `reactor.run`, and `adapter.call` in OpenTelemetry.

## Boundaries

Do not emit semantic events for every HTTP step, adapter retry, or span-internal branch.

**Promotion rule** — prefer a semantic event when:

- Another agent would react to it
- An operator wants it on a timeline
- Replay or durable history needs it
- It is a state transition, not an implementation step

## Trade-Offs

- Rich local debugging with Jaeger adds moving parts locally but reduces production guesswork.

## Related Reference

- [Observability](../reference/observability.md)
- [Debug with traces](../how-to/debug-with-traces.md)
