# `runtime-observability`

OpenTelemetry primitives for Synapse runtime processes: shared initialization, W3C trace context extraction/injection, named span helpers for runtime hops, low-cardinality metric label builders, structured log fields, and in-memory exporters for local fixtures and tests.

## Consumers

Import from `runtime-observability`. Runtime apps should call `initializeObservability({ serviceName })` once at process startup when using **`registerGlobal: true` (the default)**. Globals (W3C propagator, async context manager, tracer provider, meter provider) are installed **at most once** per process; later calls with `registerGlobal: true` skip replacing them so tests and hot reload do not corrupt tracing. Each call still returns a handle with `tracer` / `meter` instances from that handle’s own providers.

In **`local`** mode (the default when `mode` is omitted), spans are duplicated to an **in-memory exporter** (for tests that read `getFinishedSpans`) and, unless `otlpTraceEndpoint: null`, to **OTLP/HTTP** at `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://127.0.0.1:24318`, matching `local/docker-compose.yml`) so they show up in Jaeger. In **`test`** mode, only the in-memory exporter is used.

Code that uses OpenTelemetry globals (`trace.getTracer`, `metrics.getMeter`) will use the **first** globally registered providers.

Pass the returned `tracer`, `meter`, `metrics`, and helper functions into ingress, store, worker, adapter, and replay code.

## Runtime span hops (`RuntimeHop`)

Span names are derived from the `RuntimeHop` string literals (for example `adapter.request` → span name `adapter request`). The full set is exported from `src/index.ts` and listed under Task 3 in `specs/event-based-architecture.md`.

Use `runtimeSpanAuditContext(span)` when durable audit rows need to persist the trace/span IDs from the actual span that executed the work, instead of reparsing a propagated input carrier.

## Metrics (v1 counters)

These are the **actual** OpenTelemetry instrument names (not the older `*_total` sketch names in some spec examples). Labels are always bounded via the exported label builders / `assertLowCardinalityMetricLabels`.

| Instrument | Purpose |
| --- | --- |
| `synapse.events.recorded` | Events accepted at runtime boundaries |
| `synapse.outbox.operations` | Outbox enqueue / claim / publish / retry |
| `synapse.bullmq.jobs` | BullMQ enqueue and process |
| `synapse.adapter.requests` | Adapter outbound requests |
| `synapse.agent.runs` | Agent run outcomes |

**Deferred:** histograms and gauges for durations, lag, queue depth, and health (to be added when `runtime-store` / worker paths need them).

## Verify

From the **repository root**:

```bash
npx nx run runtime-observability:lint
npx nx run runtime-observability:typecheck
npx nx run runtime-observability:test
```

## Spec

Task 3 in `specs/event-based-architecture.md` describes the intended scope. **`local`** mode exports traces to the OTLP collector (and on to Jaeger in the default compose stack); **`test`** mode keeps telemetry in-memory for hermetic automation.

## Documentation

- [Observability model](../../docs/explanation/observability-model.md)
- [Observability reference](../../docs/reference/observability.md)
