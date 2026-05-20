---
title: TypeScript configuration
kind: reference
owner: docs
status: current
updated: 2026-05-21
freshness_triggers:
  - tsconfig.json
  - package.json
---

# TypeScript configuration

## Scope

Repo-root TypeScript project references and path mappings for the Nx workspace.

## Contract

Path mappings in root `tsconfig.json` use repo-root-relative targets (e.g. `"./libs/runtime-agent/src/index.ts"`) without `"baseUrl"`, per the TypeScript layout for `paths`.

## Details

Workspace packages resolve through root `paths`; run `npx nx run <project>:typecheck` from the repository root.

## Examples

```bash
npx nx run-many -t typecheck --all
```

## Related Pages

- [Workspace layout](workspace-layout.md)
- [Commands](commands.md)
