---
title: Agents
kind: reference
owner: runtime-agent
status: current
updated: 2026-05-20
freshness_triggers:
  - agents/**
  - examples/agents/**
  - manifests/**
  - apps/worker/src/manifest-registry.ts
  - apps/webhooks/**
  - scripts/dev-once/**
  - libs/synapse-fixtures/**
  - libs/agent-test-harness/**
  - libs/runtime-manifest/**
---

# Agents

## Scope

Authoritative reference for Synapse **agent packages**: where they live, how **runtime manifests** register them, how **`npm run dev:once`** exercises HTTP ingress locally, how tests prove behavior, and how application vs example agents differ.

**Manifest contracts (schemas, CLI, validation):** [Runtime manifest](runtime-manifest.md).

## Contract

- Application agents live under `agents/agent-<name>/` and load when a manifest lists them (default: `manifests/application.json`).
- Example agents live under `examples/agents/agent-<name>/` with package names `example-agent-<name>`; load them via a manifest under `manifests/examples/` (e.g. `manifests/examples/echo.json`).
- **Subscriptions** (`handles`) live in manifest JSON only — not in handler TypeScript.
- **Handlers** are default-exported async functions from paths declared in `agents[].handler`.
- **Fixture contracts** are first-class: `*.fixture.json` under `fixtures/` or `examples/fixtures/`, listed on `agents[].fixtures`, validated by `synapseFixtureSchema`, and used by `npm run dev:once` / `runDevOnce` and e2e tests.
- Workspace packages use **unscoped** npm names (`agent-reviewer`, not `@synapse/agent-reviewer`).

## Application vs example

| | Application | Example |
| --- | --- | --- |
| Directory | `agents/agent-<name>/` | `examples/agents/agent-<name>/` |
| Package / Nx id | `agent-<name>` | `example-agent-<name>` |
| Default `npm run dev` | **Yes** (`manifests/application.json`) | **No** |
| Typical manifest | `manifests/application.json` | `manifests/examples/<name>.json` |
| Handler path prefix | `agents/…` | `examples/agents/…` |
| Fixture files | `fixtures/<agent-name>/*.fixture.json` | `examples/fixtures/<package>/*.fixture.json` |
| Fixture CLI | `npm run dev:once -- --fixture <id>` (after `npm run dev`) | Same — start dev with example manifest first |

## Naming

| Concept | Example |
| --- | --- |
| Manifest / runtime agent name | `agent-reviewer`, `example-echo` |
| npm package name | `agent-reviewer`, `example-agent-echo` |
| Application webhook fixture id | `review-pr/gitlab-synapse` |
| Example webhook fixture id | `example/echo` |
| Application fixtures (static) | `fixtures/agent-reviewer/` |
| Example fixtures (static) | `examples/fixtures/example-agent-echo/` |

## Worker registration (manifest)

```text
manifests/application.json  (or SYNAPSE_RUNTIME_MANIFEST / --manifest)
  agents[].name, handler, handles[]
        │
        ▼
apps/worker/src/manifest-registry.ts
  loadValidatedManifestRegistry → wrapManifestRuntimeRegistry
        │
        ▼
runtime-worker planning
  findAgentsForEvent(event.type) → ensureAgentRun(agent, reactor: "handler")
        │
        ▼
executeRun → default export handler(ctx, event)
```

There are **no** `registered-application-agents.ts` or `registered-example-agents.ts` files. Do not use `defineAgent` / `defineReactor` for new agents.

## Package anatomy

```text
agents/agent-<name>/          # or examples/agents/agent-<name>/
  src/<feature>-agent.ts      # default export: defineAgentHandler(schema, fn)
  src/ingress.ts              # optional: ctx.emit for signals / webhook helpers
  src/index.ts                # public exports (ingress, types, setXClient hooks)
  test/unit/
  test/integration/*.e2e.test.ts   # prefer manifestPath in runAgentE2e
```

**`agent-reviewer` exemplar:** `src/review-pr-agent.ts` (handler), `src/ingress.ts` (GitLab → `pr.received.v1`), no `agent.ts` / `reactor.ts`.

Ingress emits the first signal; the worker runs the handler when an event type appears in manifest `handles`.

## Details

### Fixture contracts (first-class)

Fixtures are **named, versioned contracts** for proving an agent journey—not ad-hoc test blobs. A complete HTTP-shaped contract has three linked pieces:

| Piece | Where | Contract |
| --- | --- | --- |
| **Fixture JSON** | `fixtures/<agent-name>/*.fixture.json` or `examples/fixtures/<package>/` | `synapseFixtureSchema`: `id`, `agent`, webhook `ingress`, optional `expect` |
| **Payload file** | Path in `ingress.body.file` | Repo-root-relative JSON/Markdown |
| **Manifest discovery** | `manifests/*.json` → `agents[].fixtures` | Repo-root-relative paths to fixture JSON files |

See `libs/synapse-fixtures`, [Fixture files](fixtures.md), and repo-root `fixtures/README.md`.

### Run loop CLI

| Script | Role |
| --- | --- |
| `scripts/dev-once/cli.ts` | argv; rejects `--manifest`; reads `.synapse/dev-session.json` |
| `libs/dev-once` | `runSynapseOnce` — ingress + wait + artifact |

**Application fixtures** (with default dev session):

| Fixture id | Agent (manifest name) |
| --- | --- |
| `review-pr/gitlab-synapse` | `agent-reviewer` |

**Example fixtures** (after `npm run dev -- --manifest manifests/examples/echo.json`):

| Fixture id | Agent (manifest name) |
| --- | --- |
| `example/echo` | `example-echo` |
| `example/notifier` | _(requires notifier in manifest — see curriculum)_ |

## Testing layers

| Layer | Tooling | Infra | Proves |
| --- | --- | --- | --- |
| Unit | `test/unit/` | None | Schemas, handler logic, ingress helpers |
| Integration | `agent-test-harness` | Postgres + Redis | Manifest + handler path end-to-end |
| Webhook fixtures | `npm run dev` + `npm run dev:once -- --fixture <id>` | Long-lived stack | HTTP ingress → worker → terminal events |

**E2e with Synapse Run Loop:**

```ts
await withTestDevServer(
  { manifestPath: 'manifests/application.json' },
  async (dev) => {
    setReviewPrPiClient(createPiReviewFixtureClient({ repoRoot, fixtureFile: '…' }));
    const artifact = await runDevOnce({
      fixtureId: 'review-pr/gitlab-synapse',
      env: dev.env,
    });
    expect(artifact.status).toBe('succeeded');
  },
);
```

## Examples

```bash
# Application (default manifest)
npm run dev
npm run dev:once -- --fixture review-pr/gitlab-synapse

# Example echo manifest
npm run dev -- --manifest manifests/examples/echo.json
npm run dev:once -- --fixture example/echo

# Package tests
npx nx run agent-reviewer:test
npx nx run example-agent-echo:test
```

## Related Pages

- [Runtime manifest](runtime-manifest.md) — thorough manifest reference
- [Runtime manifest (explanation)](../explanation/runtime-manifest.md) — why manifests exist
- [Local agent development](../how-to/local-agent-development.md)
- [Run and test agents](../how-to/run-and-test-agents.md)
- [Create an application agent](../how-to/create-an-agent.md)
- [Create an example agent](../how-to/create-an-example-agent.md)
- [Agents and adapters](../explanation/agents-and-adapters.md)
- [Commands](commands.md)

Outside `docs/`: `examples/agents/README.md`, `agents/README.md`, `libs/runtime-manifest/README.md`.
