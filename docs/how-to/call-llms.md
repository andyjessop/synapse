---
title: Call LLMs
kind: how-to
owner: runtime-llm
status: current
updated: 2026-05-16
freshness_triggers:
  - libs/runtime-llm/**
---

# Call LLMs

## Goal

Add an LLM call through the Vercel AI SDK with injectable boundaries for tests.

## Before You Start

- All application LLM calls must use the `ai` package (see repo LLM rules)
- For OpenAI, use `@ai-sdk/openai` provider factories

## Steps

1. Use `runtime-llm` helpers that wrap `generateText` (or other AI SDK primitives)—do not `fetch` provider APIs directly.

2. For OpenAI models, use `createOpenAI(...).responses(model)` or the supported AI SDK surface from `@ai-sdk/openai`.

3. Respect `SYNAPSE_FIXTURE_MODE` and missing `OPENAI_API_KEY`: fixture mode returns deterministic outputs in tests.

4. Inject transport or model doubles in unit/integration tests so CI never calls live providers.

5. Record spans and metrics for LLM hops (`llm.call` capture boundary where applicable).

## Verify

```bash
npx nx run runtime-llm:test
```

Tests pass without network when fixture mode is on.

## Troubleshooting

- **Live API in CI:** Ensure tests inject fakes; never rely on real keys in `nx run-many -t test --all`.
