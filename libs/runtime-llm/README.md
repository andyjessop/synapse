# runtime-llm

Vercel AI SDK wrapper for Synapse with live and fixture modes.

## Responsibilities

- `generateText` (and related primitives) through the `ai` package
- Fixture mode when `SYNAPSE_FIXTURE_MODE` or missing API keys require deterministic output
- Injectable boundaries for tests

## Non-responsibilities

- Direct HTTP calls to model providers
- Agent business policy (agents decide when to call LLMs)

## Key exports

Entry: `libs/runtime-llm/src/index.ts`.

## Documentation

- [Call LLMs](../../docs/how-to/call-llms.md)
