---
title: Debug with traces
kind: how-to
owner: runtime-observability
status: current
updated: 2026-05-20
freshness_triggers:
  - libs/runtime-observability/**
  - scripts/dev-once/**
---

# Debug with traces

## Goal

Correlate OpenTelemetry traces, Jaeger UI, and runtime capture roots for one run.

## Before You Start

- Local Jaeger running (`npm run dev:infra`)
- A completed **`npm run dev:once`** run or worker workflow with printed `correlationid` and `jaeger_trace_url`

## Steps

1. Run **`npm run dev`** (or **`npm run dev:example`** / **`npm run dev -- --manifest …`**) plus **`npm run dev:once -- --scenario <id>`** and open the `jaeger:` line from output when printed (direct `/trace/{traceId}` link).

2. Open Jaeger (default UI `http://127.0.0.1:26686`) and inspect spans: `ingress emit`, `event append`, `bullmq process`, handler run, etc.

3. Join the trace with Postgres `events` and `agent_runs` rows by event IDs and run IDs in span attributes (see [Observability](../reference/observability.md)).

## Verify

Spans cover the same causal path as the runtime rows for the run.

## Troubleshooting

- **No traces in Jaeger:** Confirm `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://127.0.0.1:24318`) and collector health on port `21333`.

## Related pages

- [Runtime manifest](../reference/runtime-manifest.md)
- [Local agent development](local-agent-development.md)
