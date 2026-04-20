---
title: Build a fixture agent
kind: tutorial
owner: runtime-agent
status: current
updated: 2026-05-20
freshness_triggers:
  - examples/agents/**
  - manifests/examples/**
  - libs/runtime-events/**
  - libs/runtime-agent/**
  - libs/runtime-manifest/**
---

# Build a fixture agent

## What You Will Build

You will extend the **echo example** pattern: a new example agent package with owned events, a default-export **handler**, optional ingress, a **manifest** under `manifests/examples/` with `agents[].fixtures` (when HTTP exists), and tests—without calling live external APIs.

## Prerequisites

- Completed [Local runtime example (echo)](local-runtime-example-echo.md)
- [Runtime manifest](../reference/runtime-manifest.md)
- [Create an example agent](../how-to/create-an-example-agent.md)
- [Add a runtime event](../how-to/add-a-runtime-event.md)

## Steps

1. **Fork `examples/agents/example-agent-echo`** to `examples/agents/example-agent-<name>/` with package name `example-agent-<name>`, or follow curriculum step 2 (`example-agent-salute`).

2. **Add or reuse events** in `libs/runtime-events` (`<domain>.<fact>.v1`, Zod `data` schemas).

3. **Implement the agent package:** default-export handler with `defineAgentHandler`; optional `ingress.ts` for the first signal only. Do **not** add `agent.ts` / `reactor.ts` with `defineAgent` / `subscribesTo`.

4. **Create `manifests/examples/<name>.json`** with `agents[]` (`name`, `handler` path under `examples/agents/…`, `handles`) and `webhooks.routes` listing your route id(s).

5. **Wire HTTP (when applicable):** route in `apps/webhooks` + `*.fixture.json` with id `example/<slug>`; list the path on manifest `agents[].fixtures`.

6. **Add fixtures** under `examples/fixtures/example-agent-<name>/` when ingress needs a file payload.

7. **Add tests:** unit tests in `test/unit/`; e2e in `test/integration/*.e2e.test.ts` with `agent-test-harness` and `manifestPath`.

8. **Run:**

```bash
npx nx run example-agent-<name>:test
npm run dev:infra
npm run dev -- --manifest manifests/examples/<name>.json
npm run dev:once -- --fixture example/<slug>
```

9. **Document** the new row in `examples/agents/README.md`.

## Verify It Worked

- Manifest validation passes at worker startup (`npx nx run runtime-manifest:test` when touching rules).
- **`npm run dev:once`** exits `0` and prints the expected outcome event type when the stack is healthy.
- `npx nx run example-agent-<name>:test` passes (integration skips without Docker).

## What You Learned

- **Manifests** declare subscriptions; handler modules implement behavior.
- Example agents use `*.fixture.json` on `agents[].fixtures` and `manifests/examples/*.json`.
- Application agents belong in `manifests/application.json`, not example manifests.

## Next Steps

- Example agents curriculum (`examples/agents/README.md`)
- [Runtime manifest](../reference/runtime-manifest.md)
- [Agent reference](../reference/agents.md)
- [Agents and adapters](../explanation/agents-and-adapters.md)
