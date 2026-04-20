---
title: Create an example agent
kind: how-to
owner: runtime-agent
status: current
updated: 2026-05-20
freshness_triggers:
  - examples/agents/**
  - manifests/**
  - libs/runtime-agent/**
  - apps/webhooks/**
  - examples/fixtures/**/*.fixture.json
  - libs/synapse-fixtures/**
---

# Create an example agent

## Goal

Add a **curriculum / regression** agent under `examples/agents/` that is **not** loaded by default `npm run dev`, but can run locally via a **dedicated manifest**.

## Before You Start

- [Runtime manifest](../reference/runtime-manifest.md)
- [Create an application agent](create-an-agent.md) — same handler pattern
- [Local runtime example (echo)](../tutorials/local-runtime-example-echo.md)
- Reference: `examples/agents/example-agent-echo/`, `manifests/examples/echo.json`

## Steps

1. Copy layout from `examples/agents/example-agent-echo/` (handler + optional ingress).

2. Package name: `example-agent-<name>`.

3. Implement **default-export handler** with `defineAgentHandler` — no `defineAgent` / reactors.

4. Register event types in `libs/runtime-events` if new.

5. Create **`manifests/examples/<name>.json`**:

```json
{
  "version": 1,
  "name": "example-<name>",
  "agents": [
    {
      "name": "example-<slug>",
      "handler": "examples/agents/example-agent-<name>/src/<name>-agent.ts",
      "handles": ["example.my-signal.v1"]
    }
  ],
  "webhooks": {
    "routes": ["synapse.webhooks.example-echo-ping.v1"],
    "fixtures": ["example/<slug>"]
  }
}
```

6. Add static payload under `examples/fixtures/example-agent-<name>/`.

7. Add HTTP route in `apps/webhooks` when ingress is HTTP-shaped.

8. Add `examples/fixtures/example-agent-<name>/<slug>.fixture.json` (`example/<slug>`, webhook `ingress`, optional `expect`).

9. List the fixture path on `agents[].fixtures` in the example manifest.

10. Unit tests + `test/integration/*.e2e.test.ts` with `withTestDevServer` + `runDevOnce`.

11. Document in `examples/agents/README.md` curriculum table.

12. **Do not** add example agents to `manifests/application.json`.

## Verify

```bash
npx nx run example-agent-<name>:test
npm run dev:infra
npm run dev -- --manifest manifests/examples/<name>.json
npm run dev:once -- --fixture example/<slug>
```

For SQLite examples, pass `agentSqlite: { baseDir }` into `runAgentE2e` (see existing sqlite example packages).

## Troubleshooting

- **Wrong stack:** Example manifest must list example webhook route ids under `webhooks.routes`.
- **Fixture not listed:** Path must be on `agents[].fixtures` and `ingress.path` must match a mounted route.
- **`dev:once --manifest`:** Not supported — restart dev with `--manifest`.

## Related pages

- [Runtime manifest](../reference/runtime-manifest.md)
- [Agent reference](../reference/agents.md)
- [Build a fixture agent](../tutorials/build-a-fixture-agent.md)
