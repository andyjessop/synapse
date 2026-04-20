---
title: 'ADR 0001: Markdown Diataxis documentation'
kind: adr
owner: docs
status: current
updated: 2026-05-16
freshness_triggers:
  - docs/**
  - specs/docs.md
---

# ADR 0001: Markdown Diataxis documentation

## Status

Accepted

## Context

Synapse needs contributor documentation that is easy to navigate locally, stays aligned with shipped code, and does not duplicate implementation specs. A docs site generator adds operational cost before the content model is proven.

## Decision

Adopt Markdown-first documentation under `docs/` using the [Diataxis](https://diataxis.fr/) categories: tutorials, how-to guides, explanation, reference, and ADRs. Enforce structure with `scripts/docs-check.ts` and Vitest unit tests. Defer hosted sites and generated API docs until v1 content and validation are stable.

## Consequences

- Contributors read docs directly in the repository or editor.
- PRs must pass `npm run docs:check`.
- Package READMEs stay short and link into `docs/`.
- Implementation specs remain in `specs/` as background, not as the user manual.

## Related

- [Documentation index](../README.md)
- Implementation background: `specs/docs.md`
