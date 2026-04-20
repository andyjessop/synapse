---
title: Add a runtime event
kind: how-to
owner: runtime-events
status: current
updated: 2026-05-16
freshness_triggers:
  - libs/runtime-events/**
---

# Add a runtime event

## Goal

Add a new semantic event type to the authoritative registry with Zod validation.

## Before You Start

- Read [Event contracts](../reference/event-contracts.md)
- Decide category (`signal`, `intent`, `outcome`, `lifecycle`) and owning agent

## Steps

1. Open `libs/runtime-events/src/index.ts` and add an entry to `eventRegistryDefinition` with:
   - `type`: `<domain>.<fact>.v1` (lowercase segments, version suffix `v1`, `v2`, …)
   - `category`, `owner`, and `schema` (Zod object for `data`)

2. For intent events that another agent may emit, set `emitByProxy` only when `category === 'intent'`.

3. Export derived types via `defineEventRegistry` / `EventType` narrowing.

4. Add unit tests under `libs/runtime-events/test/` for schema validation and registry membership.

5. Update agent definitions so `owns` / `consumes` / `emits` reference the new type.

## Verify

```bash
npx nx run runtime-events:test
npx nx run runtime-agent:test
```

Registry build must not throw on unknown types or ownership violations.

## Troubleshooting

- **`events.owns` mismatch:** `getEventOwner(type)` must equal the owning agent name.
- **Proxy emit denied:** Only intent category events may use `emitByProxy`; emitting agent must be listed.

Propagation at ingress: set `correlationid`, `causationid`, and `traceparent` using helpers such as `createRootEventLinks` / `createChildEventLinks` from `runtime-events`.
