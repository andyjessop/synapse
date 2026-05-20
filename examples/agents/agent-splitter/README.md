# example-agent-splitter

Curriculum step 5: one signal, two reactors (fan-out to separate outcome events).

## Agent vs ingress

| File | Loaded by worker? | Role |
| --- | --- | --- |
| `src/agent.ts` | Yes | `notify-email` and `notify-slack` (same subscription) |
| `src/ingress.ts` | No | Emits `notify.broadcast.v1` |

Both reactors subscribe to the same signal; the worker plans one run per reactor.

## Flow

```
notify.broadcast.v1  →  notify-email  →  notify.email.v1
                      →  notify-slack  →  notify.slack.v1
```

| Event | Role |
| --- | --- |
| `notify.broadcast.v1` | Signal (ingress) |
| `notify.email.v1` | Outcome |
| `notify.slack.v1` | Outcome |

**Agent name:** `example-agent-splitter`  
**Reactors:** `notify-email`, `notify-slack`

## Local verification

```bash
npx nx run example-agent-splitter:test
```

HTTP: when a scenario **`example/splitter`** exists on the example manifest `scenarios[]`, run **`npm run dev:example`** then **`npm run dev:once -- --scenario example/splitter`**.

Trigger: `example-agent-splitter/broadcast` → `triggerBroadcast()`.

Single-shot completion waits on `notify-email`; integration tests assert both outcomes.

## Tests

```bash
npx nx run example-agent-splitter:test
```

## Worker

Loaded when listed in the active example manifest.
