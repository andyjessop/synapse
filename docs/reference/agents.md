---
title: Agents
kind: reference
owner: runtime-agent
status: current
updated: 2026-05-21
freshness_triggers:
  - agents/**
  - examples/agents/**
  - manifests/**
  - apps/worker/src/manifest-registry.ts
  - apps/worker/src/shipped-agents.ts
  - apps/ingress/**
  - scripts/dev-once/**
  - scenarios/**
  - libs/agent-test-harness/**
  - libs/runtime-manifest/**
---

# Agents

## Scope

Authoritative reference for Synapse **agent packages**: where they live, how **runtime manifests** mount them, how **`defineAgent`** and **`shipped-agents.ts`** register definitions, how **`npm run dev:once`** exercises scenarios locally, and how application vs example agents differ.

**Manifest contracts (schemas, CLI, validation):** [Runtime manifest](runtime-manifest.md).

## Contract

- Application agents live under `agents/agent-<name>/` and load when a manifest lists `{ "name": "…" }` (default: `manifests/application.json`).
- Example agents live under `examples/agents/agent-<name>/` with package names `example-agent-<name>`; load them via `manifests/examples/*.json`.
- **Subscriptions** (`handles`) and **`usesAdapters`** live in **`defineAgent`** (`*-agent.definition.ts`), not in manifest JSON.
- **Handlers** are default-exported functions wired through `run:` on the definition (usually `defineAgentHandler`).
- **Run-loop proof** uses **`scenarios/*.scenarios.json`** listed on manifest `scenarios[]`; static payloads live under `fixtures/` or `examples/fixtures/`.
- Workspace packages use **unscoped** npm names (`agent-reviewer`, not `@synapse/agent-reviewer`).

## Application vs example

| | Application | Example |
| --- | --- | --- |
| Directory | `agents/agent-<name>/` | `examples/agents/agent-<name>/` |
| Package / Nx id | `agent-<name>` | `example-agent-<name>` |
| Default `npm run dev` | **Yes** (`manifests/application.json`) | **No** |
| Typical manifest | `manifests/application.json` | `manifests/examples/<name>.json` |
| Definition + handler | `src/*-agent.definition.ts`, `src/*-agent.ts` | Same under `examples/agents/` |
| Scenario ids | e.g. `review-pr/gitlab-synapse` | e.g. `example/echo` |
| Static payloads | `fixtures/<agent-name>/` | `examples/fixtures/<package>/` |

## Naming

| Concept | Example |
| --- | --- |
| Manifest / runtime agent name | `agent-reviewer`, `example-echo` |
| npm package name | `agent-reviewer`, `example-agent-echo` |
| Scenario id | `review-pr/gitlab-synapse`, `example/echo` |
| Application payloads | `fixtures/agent-reviewer/` |
| Example payloads | `examples/fixtures/example-agent-echo/` |

## Worker registration

```text
*-agent.definition.ts
  defineAgent({ name, handles, usesAdapters?, run })

apps/worker/src/shipped-agents.ts
  shippedAgentsByName

manifests/application.json
  agents: [{ "name": "agent-reviewer" }]

apps/worker/src/manifest-registry.ts
  loadValidatedManifestRegistry({ shippedAgents, knownEventTypes, … })

runtime-worker planning
  findAgentsForEvent(event.type) → ensureAgentRun(agent, reactor: "handler")
        │
        ▼
executeRun → definition.run(ctx, event)
```

There are **no** `registered-application-agents.ts` files. **Shipped** agents use **`defineAgent`** + **`shipped-agents.ts`**. Example curriculum packages may still use **`defineRegistryAgent`** / **`defineReactor`** in isolated tests only — not for new product agents.

## Details

### Package anatomy

```text
agents/agent-<name>/          # or examples/agents/agent-<name>/
  src/<feature>-agent.definition.ts   # defineAgent + run: handler
  src/<feature>-agent.ts              # default export: defineAgentHandler(schema, fn)
  src/definition.ts                   # re-export for shipped-agents.ts
  src/ingress.ts                      # optional: ctx.emit for signals / webhook helpers
  src/index.ts
  test/unit/
  test/integration/*.e2e.test.ts
```

**`agent-reviewer` exemplar:** `review-pr-agent.definition.ts`, `review-pr-agent.ts`, `ingress.ts` (GitLab → `pr.received.v1`).

Ingress emits the first signal; the worker runs the handler when an event type appears in the definition’s `handles`.

### Scenarios and payloads

A **scenario** is the run-loop contract (`libs/runtime-manifest` `scenarioFileSchema`):

| Piece | Where |
| --- | --- |
| **Scenario file** | `scenarios/<owner>/*.scenarios.json`, path on manifest `scenarios[]` |
| **Scenario `id`** | CLI: `npm run dev:once -- --scenario <id>` (`--fixture` alias) |
| **Ingress** | `ingress.source` (webhook or poll catalog id) + `ingress.fixtures[]` |
| **Adapter mocks** | Optional `adapters[]` on the scenario (FIFO on `apps/adapters` during `dev:once`) |
| **Payload files** | Repo-root paths in `ingress.fixtures[].file` |

See [Fixture files](fixtures.md) (payload and scenario layout), `scenarios/echo.scenarios.json`, `scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json`.

#### Run loop CLI

| Script | Role |
| --- | --- |
| `scripts/dev-once/cli.ts` | argv; `--manifest` override; defaults to `manifests/application.json` |
| `libs/dev-once` | `runDevOnce({ scenarioId })` — ingress + wait + artifact |

**Application scenarios** (default dev session):

| Scenario id | Agent (manifest name) |
| --- | --- |
| `review-pr/gitlab-synapse` | `agent-reviewer` |

**Example scenarios** (after `npm run dev -- --manifest manifests/examples/echo.json`):

| Scenario id | Agent (manifest name) |
| --- | --- |
| `example/echo` | `example-echo` |

### Testing layers

| Layer | Tooling | Infra | Proves |
| --- | --- | --- | --- |
| Unit | `test/unit/` | None | Schemas, handler logic, ingress helpers |
| Integration | `agent-test-harness` | Postgres + Redis | Manifest + shipped definition end-to-end |
| Scenarios | `npm run dev` + `npm run dev:once -- --scenario <id>` | Long-lived stack | HTTP ingress → worker → terminal events |

**E2e with Synapse Run Loop:**

```ts
import { eventRegistry } from 'runtime-events';
import { shippedAgentsByName } from '../../../../../apps/worker/src/shipped-agents.js';

const knownEventTypes = new Set(Object.keys(eventRegistry));

await withTestDevServer(
  {
    manifestPath: 'manifests/application.json',
    shippedAgents: shippedAgentsByName,
    knownEventTypes,
  },
  async (dev) => {
    const artifact = await runDevOnce({
      scenarioId: 'review-pr/gitlab-synapse',
      env: dev.env,
    });
    expect(artifact.status).toBe('succeeded');
  },
);
```

The harness **must** receive `shippedAgents` and `knownEventTypes` from the app composition root — it does not import agents by default.

## Examples

```bash
# Application (default manifest)
npm run dev
npm run dev:once -- --scenario review-pr/gitlab-synapse

# Example echo manifest
npm run dev -- --manifest manifests/examples/echo.json
npm run dev:once -- --scenario example/echo

# Package tests
npx nx run agent-reviewer:test
npx nx run example-agent-echo:test
```

## Related Pages

- [Runtime manifest](runtime-manifest.md)
- [Runtime manifest (explanation)](../explanation/runtime-manifest.md)
- [Local agent development](../how-to/local-agent-development.md)
- [Run and test agents](../how-to/run-and-test-agents.md)
- [Create an application agent](../how-to/create-an-agent.md)
- [Create an example agent](../how-to/create-an-example-agent.md)
- [Agents and adapters](../explanation/agents-and-adapters.md)
- [Commands](commands.md)

Outside `docs/`: `examples/agents/README.md`, `agents/README.md`, `libs/runtime-manifest/README.md`.
