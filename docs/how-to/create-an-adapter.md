---
title: Create an adapter
kind: how-to
owner: runtime-agent
status: current
updated: 2026-05-16
freshness_triggers:
  - libs/runtime-agent/**
---

# Create an adapter

## Goal

Define an external I/O boundary with a Zod config schema and register it for agent use.

## Before You Start

- [Agents and adapters](../explanation/agents-and-adapters.md)

## Steps

1. Define with `defineAdapter` in `libs/runtime-agent`:
   - `name`, `description`, `externalSystem`
   - `configSchema` (Zod)

2. Register the adapter in `createRuntimeRegistry` input.

3. Reference it from agents via `adapters.uses`.

4. Implement adapter client code in a dedicated module; perform HTTP/SDK calls only inside adapter boundaries.

5. Instrument I/O with `runWithRuntimeSpan` (`adapter.request` hop) and outcome metrics per observability rules.

6. Add unit tests with fakes; integration tests must not call real third-party tenants by default.

## Verify

Registry validation passes; adapter requests emit traces and `synapse.adapter.requests` metrics with low-cardinality labels.

## Troubleshooting

- **Missing config schema:** Adapters require a Zod-like `configSchema`.
- **Replay safety:** During replay, short-circuit external mutations unless execute mode explicitly allows them.

Adapters perform external IO; agents decide when IO should happen.
