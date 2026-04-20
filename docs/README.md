---
title: Synapse Documentation
kind: reference
owner: docs
status: current
updated: 2026-05-20
freshness_triggers:
  - docs/**
---

# Synapse Documentation

Synapse is a local-first, event-driven agentic runtime: durable events and reactor runs in Postgres, BullMQ execution, and OpenTelemetry observability.

## Start Here

New contributors should follow this path:

1. [Local runtime example (echo)](tutorials/local-runtime-example-echo.md) — `example/echo` with `manifests/examples/echo.json`
2. Example agents curriculum (`examples/agents/README.md`) — steps 1–11
3. [Runtime manifest](reference/runtime-manifest.md) — how agents are registered; fixtures as contracts (read early)
4. [Local agent development](how-to/local-agent-development.md) — `npm run dev`, manifests, `dev:once` fixtures
5. [Run and test agents](how-to/run-and-test-agents.md)
6. [Agent reference](reference/agents.md)
7. [Create an application agent](how-to/create-an-agent.md) — when shipping product capability
8. [Create an example agent](how-to/create-an-example-agent.md) — when extending the curriculum

## Choose The Right Doc

| You want to… | Read |
| --- | --- |
| Learn by doing, step by step | [Tutorials](tutorials/README.md) |
| Understand manifests (schemas, dev session, handlers) | [Runtime manifest](reference/runtime-manifest.md) |
| Run agents locally (`dev`, `--manifest`, `dev:once`) | [Local agent development](how-to/local-agent-development.md) |
| Solve a specific task | [How-to guides](how-to/README.md) |
| Understand why the system works this way | [Explanation](explanation/README.md) |
| Look up exact commands, APIs, or contracts | [Reference](reference/README.md) |
| See an accepted design decision | [ADRs](adr/README.md) |

## Tutorials

Learning-oriented lessons. See [tutorials index](tutorials/README.md).

## How-To Guides

Task-focused procedures. See [how-to index](how-to/README.md).

## Explanation

Conceptual background. See [explanation index](explanation/README.md).

## Reference

Exact contracts and lists. See [reference index](reference/README.md).

## ADRs

Architecture decision records. See [ADR index](adr/README.md).

## Maintainers

- Run `npm run docs:check` from the repo root before merging doc changes.
- Keep `docs/` aligned with shipped code; use `specs/` only for implementation background links.
- Update `freshness_triggers` in frontmatter when ownership boundaries move.
