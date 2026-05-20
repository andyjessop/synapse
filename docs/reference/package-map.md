---
title: Package map
kind: reference
owner: repo
status: current
updated: 2026-05-21
freshness_triggers:
  - apps/*/package.json
  - libs/*/package.json
  - agents/*/package.json
  - adapters/*/package.json
  - examples/agents/*/package.json
---

# Package map

## Scope

Workspace packages, responsibilities, and entrypoints.

## Contract

Package `name` in `package.json` is the Nx project id.

## Details

### Application agents

| Package | Path | Role |
| --- | --- | --- |
| `agent-reviewer` | `agents/agent-reviewer` | Application: PR review |

### Example agents

| Package | Path | Role |
| --- | --- | --- |
| `example-agent-*` | `examples/agents/agent-*` | Curriculum / regression (12 packages) |

### Adapters

| Package | Path | Role |
| --- | --- | --- |
| `adapter-gitlab` | `adapters/adapter-gitlab` | GitLab adapter source (`defineAdapterSource`) |

### Apps

| Package | Path | Responsibility | Entry |
| --- | --- | --- | --- |
| `worker` | `apps/worker` | Manifest registry, Postgres streams → BullMQ → handlers | `src/main.ts` |
| `ingress` | `apps/ingress` | Webhook and poll ingress | `src/main.ts` |
| `adapters` | `apps/adapters` | Shipped adapter RPC (`shipped-adapters.ts`) | `src/main.ts` |

### Libs

| Package | Path | Responsibility | Entry |
| --- | --- | --- | --- |
| `runtime-events` | `libs/runtime-events` | Event registry, schemas, topics | `src/index.ts` |
| `runtime-agent` | `libs/runtime-agent` | `defineAgent`, `defineAgentHandler`, legacy registry helpers | `src/index.ts` |
| `runtime-adapters` | `libs/runtime-adapters` | `defineAdapterSource`, adapter RPC port | `src/index.ts` |
| `runtime-manifest` | `libs/runtime-manifest` | Manifest + scenario schemas, `loadValidatedManifestRegistry` | `src/index.ts` |
| `runtime-store` | `libs/runtime-store` | Postgres schema and access | `src/index.ts` |
| `synapse-scenarios` | `libs/synapse-scenarios` | Scenario loading for dev:once | `src/index.ts` |
| `pi-harness` | `libs/pi-harness` | Pi Coding Agent harness (SDK, CLI subprocess, fixtures, `fetch_merge_request_diff` tool) for agents; today wired to `agent-reviewer`’s `PiReviewClient` types—**not** the Redux `pi` client package and **not** part of the `runtime-*` durable/event stack | `src/index.ts` |
| `runtime-config` | `libs/runtime-config` | Runtime env parsing and path helpers | `src/index.ts` |
| `dev-tooling` | `libs/dev-tooling` | Local infra doctor and runtime liveness probes | `src/index.ts` |
| `runtime-llm` | `libs/runtime-llm` | Vercel AI SDK wrapper | `src/index.ts` |
| `agent-test-harness` | `libs/agent-test-harness` | Postgres/Redis/worker bootstrap for agent e2e tests | `src/index.ts` |
| `pi` | `libs/pi` | Redux router + modules for client | `src/index.ts` |

### Typical dependencies

- Apps → `runtime-*` libs, not vice versa
- `worker` → `runtime-worker`, `runtime-agent`, `runtime-store`, `pi-harness`, …

## Examples

```bash
npx nx run runtime-worker:test
```

## Related Pages

- [Agents](agents.md)
- [Architecture overview](../explanation/architecture-overview.md)
- [Storage schema](storage-schema.md)
