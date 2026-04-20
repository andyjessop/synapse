---
title: Run once with fixtures
kind: how-to
owner: docs
status: current
updated: 2026-05-20
freshness_triggers:
  - scripts/dev-once/**
  - manifests/**
  - fixtures/**
---

# Run once with fixtures

## Goal

Send one manifest fixture into the running local stack and inspect the resulting event flow.

## Before You Start

- `npm run dev:infra` (Postgres + Redis)
- `npm run dev` (or `npm run dev -- --manifest <path>`) in another terminal

## Steps

1. List fixtures for the active session:

   ```bash
   npm run dev:once -- --list
   ```

2. Run a fixture by id:

   ```bash
   npm run dev:once -- --fixture review-pr/gitlab-synapse
   ```

3. Or use the interactive picker:

   ```bash
   npm run dev:once
   ```

4. While the run is in progress, the CLI prints **timeline lines** as events and agent runs land in Postgres. Use `--json` or `--no-wait` to skip live output.

5. Machine-readable artifact:

   ```bash
   npm run dev:once -- --fixture example/echo --json
   ```

## Verify

- CLI prints `status: succeeded` (or inspect `--json` artifact).
- Graph snapshot under `tmp/dev/runs/` when webhooks accepted the ingress.

## Tests

```ts
await withTestDevServer(
  { manifestPath: 'manifests/application.json' },
  async (dev) => {
    const artifact = await runDevOnce({
      fixtureId: 'review-pr/gitlab-synapse',
      env: dev.env,
    });
    expect(artifact.status).toBe('succeeded');
  },
);
```

## Troubleshooting

| Issue | Fix |
| --- | --- |
| Missing `.synapse/dev-session.json` | Start `npm run dev` first |
| `dev:once --manifest` error | Use `npm run dev -- --manifest` instead |
| Fixture not listed | Add `agents[].fixtures` path in the manifest JSON file |
| Webhooks unreachable | Ensure `npm run dev` is still running |
