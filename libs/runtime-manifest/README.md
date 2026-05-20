# runtime-manifest

JSON manifest parsing, validation, and registry wiring for the Synapse agent runtime.

## Manifest format

See `manifests/application.json` and [docs/reference/runtime-manifest.md](../../docs/reference/runtime-manifest.md).

Each agent entry is **`{ "name": "<agent-name>" }` only**. Handles, `usesAdapters`, and handler wiring live in **`defineAgent`** (`apps/worker/src/shipped-agents.ts`).

Optional top-level fields: `webhooks[]`, `pollers[]`, `adapters[]`.

## Loading

```ts
import { loadValidatedManifestRegistry } from 'runtime-manifest';
import { eventRegistry } from 'runtime-events';

const { registry } = await loadValidatedManifestRegistry({
  repoRoot,
  manifestPath: '/abs/path/manifests/application.json',
  shippedAgents: shippedAgentsByName,
  knownEventTypes: new Set(Object.keys(eventRegistry)),
});
registry.findAgentsForEvent('pr.received.v1');
```

## Scenarios

Scenario files under `scenarios/**/*.scenarios.json` use `scenarioFileSchema`. Each scenario declares **`manifests[]`** (runtime manifest `name` values it may run under). `listScenarioPathsForManifest` discovers files and filters by the active manifest for `dev:once --list` / `--scenario`.

## Tests

```bash
npx nx run runtime-manifest:test
```
