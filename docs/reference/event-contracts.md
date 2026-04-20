---
title: Event contracts
kind: reference
owner: runtime-events
status: current
updated: 2026-05-19
freshness_triggers:
  - libs/runtime-events/**
---

# Event contracts

## Scope

Event type naming, registry metadata, topic conversion, and payload validation.

## Contract

Source: `libs/runtime-events/src/index.ts`.

- **Type pattern:** `^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.v[1-9][0-9]*$` (e.g. `example.ping.v1`)
- **Topic:** dots → slashes (`example/ping/v1`) via `eventTypeToTopic`
- **Categories:** `signal`, `intent`, `outcome`, `lifecycle`
- **Owner:** each type has `owner` (`AgentName` or `runtime`)

## Details

Authoritative registry entries include:

- `example.ping.v1`, `example.pong.v1`
- `runtime.fixture.signal.v1`
- `pr.received.v1`, `pr.reviewed.v1`
- `ticket.opened.v1`, `ticket.notified.v1`
- `pipeline.raw.v1`, `pipeline.parsed.v1`, `pipeline.done.v1`
- `notify.broadcast.v1`, `notify.email.v1`, `notify.slack.v1`
- `chat.question.v1`, `chat.answer.v1`, `chat.closed.v1`

Key exports:

- `eventRegistry`, `isEventType`, `getEventCategory`, `getEventOwner`
- `validateEventData`
- `eventTypeToTopic`, `eventTypeFromTopic`

Ingress must validate external inputs before emit. `runtime-store.appendEvent` validates event payloads before append.

## Examples

```ts
// Naming: domain.fact.v1
'example.ping.v1';
```

## Related Pages

- [Add a runtime event](../how-to/add-a-runtime-event.md)
- [Runtime registry](runtime-registry.md)
