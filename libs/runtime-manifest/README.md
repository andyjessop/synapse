# runtime-manifest

JSON manifest parsing, validation, and handler resolution for the Synapse agent runtime.

## Manifest format

See `manifests/application.json` and [docs/reference/runtime-manifest.md](../../docs/reference/runtime-manifest.md). Each agent entry has `name`, `handler` (repo-relative module path), and `handles` (event types).

## Handler paths

- Prefix allowlist: `agents/` or `examples/agents/`
- No `..` segments
- Default export must be an `AgentHandler` function (`runtime-agent`)

Optional local-only widen: `SYNAPSE_ALLOW_LOCAL_MANIFEST_IMPORTS=1` skips the `agents/` / `examples/agents/` prefix allowlist at import time (still rejects `..` and paths outside the repo root).

## Usage

```ts
import { loadValidatedManifestRegistry } from 'runtime-manifest';

const { registry } = await loadValidatedManifestRegistry({
  repoRoot,
  manifestPath: '/abs/path/manifests/application.json',
});
registry.findAgentsForEvent('pr.received.v1');
```

## Tests

```bash
npx nx run runtime-manifest:test
```
