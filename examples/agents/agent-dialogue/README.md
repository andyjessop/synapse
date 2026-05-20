# example-agent-dialogue

Curriculum example: **two agents** on one trace — question, cross-agent answer, then close.

## Agents vs ingress

| Piece | Loaded by worker? | Role |
| --- | --- | --- |
| `src/questioner.ts` | Yes | Reacts to `chat.answer.v1` → emits `chat.closed.v1` |
| `src/responder.ts` | Yes | Reacts to `chat.question.v1` → emits `chat.answer.v1` |
| `src/ingress.ts` | No | Emits initial `chat.question.v1` (questioner-owned signal) |

Each agent only emits events it **owns** in the registry. The responder subscribes to the questioner’s signal; the questioner subscribes to the responder’s intent.

## Flow

```
chat.question.v1   (example-agent-dialogue-questioner, ingress)
       │
       ▼
chat.answer.v1     (example-agent-dialogue-responder)
       │
       ▼
chat.closed.v1     (example-agent-dialogue-questioner)
```

## Local verification

```bash
npx nx run example-agent-dialogue:test
```

HTTP: when a scenario **`example/dialogue`** exists on the example manifest `scenarios[]`, run **`npm run dev:example`** then **`npm run dev:once -- --scenario example/dialogue`**.

Trigger: `example-agent-dialogue/dialogue` → `triggerDialogue()`.

## Tests

```bash
npx nx run example-agent-dialogue:test
```

Register **both** `dialogueAgentDefinitions` in integration tests and the examples worker set.

## Worker

Both agents load when listed in the active example manifest.
