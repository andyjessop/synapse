# example-agent-notifier

Curriculum step 9: webhook-shaped JSON fixture as ingress (no live HTTP).

## Agent vs ingress

| File | Loaded by worker? | Role |
| --- | --- | --- |
| `src/agent.ts` | Yes | `notify-ticket` → `ticket.notified.v1` |
| `src/ingress.ts` | No | Loads fixture JSON → `ticket.opened.v1` |

Same pattern as application webhook ingress (`agent-reviewer`), but file-based for tests and direct ingress instead of HTTP.

## Flow

| Event | Role |
| --- | --- |
| `ticket.opened.v1` | Signal (ingress) |
| `ticket.notified.v1` | Outcome |

**Agent name:** `example-agent-notifier`  
**Reactor:** `notify-ticket`

## Local verification

```bash
npx nx run example-agent-notifier:test
```

HTTP: when a scenario **`example/notifier`** exists on the example manifest `scenarios[]`, run **`npm run dev:example`** then **`npm run dev:once -- --scenario example/notifier`**.

Trigger: `example-agent-notifier/ticket` → `triggerTicketOpened()`.

## Fixtures

- `examples/fixtures/agent-notifier/ticket-opened.json`

## Tests

```bash
npx nx run example-agent-notifier:test
```

## Worker

Loaded when listed in the active manifest (e.g. `manifests/examples/all.json`).
