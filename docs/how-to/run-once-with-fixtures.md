---
title: Run once with scenarios
kind: how-to
owner: docs
status: current
updated: 2026-05-21
freshness_triggers:
  - scripts/dev-once/**
  - manifests/**
  - scenarios/**
---

# Run once with scenarios

## Goal

Run one manifest **scenario** against the running local stack and inspect the resulting event flow.

## Before You Start

- `npm run dev:infra` (Postgres + Redis) when using the full stack
- `npm run dev` (or `npm run dev -- --manifest <path>`) in another terminal

## Steps

1. List scenarios for the active session:

   ```bash
   npm run dev:once -- --list
   ```

2. Run a scenario by id (`--fixture` is an alias):

   ```bash
   npm run dev:once -- --scenario review-pr/gitlab-synapse
   ```

3. Or use the interactive picker:

   ```bash
   npm run dev:once
   ```

4. While the run is in progress, the CLI prints **timeline lines** as events and agent runs land in Postgres. Use `--json` or `--no-wait` to skip live output.

5. Machine-readable artifact:

   ```bash
   npm run dev:once -- --scenario example/echo --json
   ```

## Verify

- CLI prints `status: succeeded` (or inspect `--json` artifact).
- Graph snapshot under `tmp/dev/runs/` when ingress accepted the run.

## Tests

```ts
import { eventRegistry } from 'runtime-events';
import { shippedAgentsByName } from '../../../apps/worker/src/shipped-agents.js';

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

## Troubleshooting

| Issue | Fix |
| --- | --- |
| Ingress unreachable | Start `npm run dev` first |
| `dev:once --manifest` error | Use `npm run dev -- --manifest` instead |
| Scenario not listed | Add `scenarios[]` path on the manifest; check scenario `id` |
| Webhooks unreachable | Ensure `npm run dev` is still running |
