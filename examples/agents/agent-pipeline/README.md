# example-agent-pipeline

Curriculum step 4: two reactors chained via an intent event (`pipeline.parsed.v1`).

## Agent vs ingress

| File | Loaded by worker? | Role |
| --- | --- | --- |
| `src/agent.ts` | Yes | `parse-raw` then `finalize` reactors |
| `src/ingress.ts` | No | Emits `pipeline.raw.v1` (the raw payload signal) |

`triggerPipeline()` only appends the first event. Parsing and completion happen asynchronously in reactors.

## Flow

```
pipeline.raw.v1  →  parse-raw  →  pipeline.parsed.v1  →  finalize  →  pipeline.done.v1
```

| Event | Role |
| --- | --- |
| `pipeline.raw.v1` | Signal (ingress) |
| `pipeline.parsed.v1` | Intent |
| `pipeline.done.v1` | Outcome |

**Agent name:** `example-agent-pipeline`  
**Reactors:** `parse-raw`, `finalize`

## Local verification

```bash
npx nx run example-agent-pipeline:test
```

HTTP: when **`example/pipeline`** is listed on the example manifest `agents[].fixtures`, run **`npm run dev:example`** then **`npm run dev:once -- --fixture example/pipeline`**.

Trigger: `example-agent-pipeline/pipeline` → `triggerPipeline()` (default payload: three lines with a blank line).

Completion waits on `finalize` producing `pipeline.done.v1`.

## Tests

```bash
npx nx run example-agent-pipeline:test
```

Integration asserts both reactor runs and the final outcome event.

## Worker

Loaded when listed in the active example manifest.
