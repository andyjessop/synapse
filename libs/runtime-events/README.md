# `runtime-events`

Zod-first event contracts for the Synapse runtime: registry entries (payload schema + category + owning agent), optional **intent-only** `emitByProxy` allowlists (non-intent definitions with `emitByProxy` fail at registry build time), payload validation, and event-type **topic string** helpers (`eventTypeToTopic` / `eventTypeFromTopic` for stable slash-delimited identifiers).

## Consumers

Import from `libs/runtime-events` (package name `runtime-events`). The registry keys are the only valid event type values for `validateEventData`. **`isoDateTimeSchema`** is exported for the same canonical UTC-with-milliseconds rule used by payload timestamps.

## Verify

From the **repository root**:

```bash
npx nx run runtime-events:lint
npx nx run runtime-events:typecheck
npx nx run runtime-events:test
```

## Registry

The registry is the source of truth for ownership, categories, payload schemas, and topic conversion. The authoritative sorted key list is enforced in `test/unit/narrow-registry.test.ts` beside `src/index.ts`. Runtime-worker integration fixtures retain a small set of `example.*.v1` event types so end-to-end tests use the same store validation path as production events.

## Documentation

- [Event contracts](../../docs/reference/event-contracts.md)
