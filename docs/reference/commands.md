---
title: Commands
kind: reference
owner: repo
status: current
updated: 2026-05-20
freshness_triggers:
  - package.json
  - README.md
  - scripts/dev.ts
  - scripts/dev-example.ts
  - scripts/dev-once/**
  - manifests/**
---

# Commands

## Scope

Repo-root commands and Nx invocation rules for Synapse.

## Contract

- Run workspace tooling from the **repository root**.
- Use **Nx** for package targets: `npx nx run <project>:<target>`.
- Do not `cd` into `apps/*` or `libs/*` to run package scripts as the primary path.

## Details

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies (root only) |
| `npm run dev:infra` | Start local Docker stack |
| `npm run dev:infra:doctor` | Check local infra reachability |
| `npm run dev:infra:down` | Stop containers, keep volumes |
| `npm run dev:infra:reset` | Stop containers and delete volumes |
| `npm run dev` | Start Docker infra, worker, webhooks with **`manifests/application.json`** (override with `--manifest` or `SYNAPSE_RUNTIME_MANIFEST`) |
| `npm run dev -- --manifest <path>` | Dev stack with a specific manifest (e.g. `manifests/examples/echo.json`) |
| `npm run dev:example` | Shortcut: same as `npm run dev -- --manifest manifests/examples/echo.json` |
| `npm run dev:full` | Same as `npm run dev` |
| `npm run dev:once -- --fixture <id>` | POST one manifest fixture; uses `.synapse/dev-session.json` from running `npm run dev` (no `--manifest` on this command) |
| `npm run dev:once -- --list` | List fixture ids allowed for the current dev session manifest |
| `npm run docs:check` | Validate documentation structure |
| `npm run test:docs` | Run documentation unit tests |
| `npx nx run-many -t lint --all && npx biome check biome.json vitest.config.ts` | Lint all packages |
| `npx nx run-many -t typecheck --all` | Typecheck all packages |
| `npx nx run-many -t test --all` | Test all packages |
| `npx nx run-many -t format --all && npx biome format --write biome.json vitest.config.ts` | Format all packages |
| `npx tsx scripts/docs-check.ts` | Same as `npm run docs:check` |

Example: `npm run dev -- --manifest manifests/examples/echo.json` then `npm run dev:once -- --fixture example/echo`.

## Examples

```bash
npm run dev
npm run dev -- --manifest manifests/examples/echo.json
npm run dev:once -- --fixture review-pr/gitlab-synapse
npm run dev:once -- --fixture example/echo
npm run dev:once -- --list

npx nx run worker:test
npx nx run runtime-manifest:typecheck
```

## Related Pages

- [Runtime manifest](runtime-manifest.md)
- [Environment](environment.md)
- [Workspace layout](workspace-layout.md)
- [Local runtime example (echo)](../tutorials/local-runtime-example-echo.md)
- [Run and test agents](../how-to/run-and-test-agents.md)
- [Agents](agents.md)
