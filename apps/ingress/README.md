# ingress

HTTP ingress for local Synapse development (Hono + OpenAPI at `/openapi.json`). Webhook routes and poll sources are separate surfaces on the same app.

## Webhook routes

1. **Manifest** (`webhooks[]`) lists `{ "source": "<route-id>" }` entries for this session.
2. **Catalog** (`libs/runtime-manifest/src/webhook-route-catalog.ts`) maps each id to `method` + `path`.
3. **Registry** (`src/webhooks/webhook-route-registry.ts`) maps each id to a `register*Routes` function.

## Poll sources

1. **Manifest** (`pollers[]`) lists `{ "source": "<poll-id>" }` entries (optional `intervalMs`, `lockTtlMs`, `enabled`, `params` on catalog defaults).
2. **Catalog** (`libs/runtime-manifest/src/poll-source-catalog.ts`) declares defaults and lock keys.
3. **Registrars** (`src/polling/registrars/*`) bind catalog ids to agent poll ingress (only this folder may import agent packages).

**Canonical tick path:** `runPollSource()` — used by interval supervisors and `POST /v1/poll/{sourceId}/tick`.

**Poll tick response:** `summary.rootEventIds` lists one durable event id per successful root semantic emit from that tick (new events and deduped existing events returned by `ctx.emit`). `dev:once` uses the first id as the run root.

**Scenario poll runs:** `dev:once` posts one tick with optional `scenarioFixtureContext` in the JSON body (adapter fixtures for ingress only).

**App assembly:** `resolveIngressAppConfig()` + `mountIngressSurfaces()`; `createIngressApp()` wires the Hono shell and returns `startPollSupervisors()` (not started until `main.ts` calls it).

## Scenario context (local dev)

Webhook scenarios install ingress adapter fixtures before POST:

1. `POST /v1/dev/scenario-context` with `{ "scenarioFixtureContext": { ... } }` → `{ "contextId" }`
2. Webhook POST with header `X-Synapse-Scenario-Context-Id: <contextId>` (single-use)

Enabled only when `SYNAPSE_DEV_SCENARIO_CONTEXT=1` (or `true` / `yes`). `npm run dev` sets this when the manifest mounts ingress.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `INGRESS_HOST` | `127.0.0.1` | Bind host (`WEBHOOKS_HOST` alias) |
| `INGRESS_PORT` | `3102` | Bind port (`WEBHOOKS_PORT` alias) |
| `SYNAPSE_RUNTIME_MANIFEST` | — | Manifest path |
| `SYNAPSE_DEV_SCENARIO_CONTEXT` | — | Set to `1`, `true`, or `yes` to mount dev scenario context routes |

`npm run dev` sets `SYNAPSE_RUNTIME_MANIFEST` and starts the **ingress** child process when the manifest lists `webhooks` or `pollers` (see `scripts/dev.ts`). `main.ts` loads the manifest and mounts webhooks and poll sources.

## Adding a poll source

1. Add catalog entry in `libs/runtime-manifest/src/poll-source-catalog.ts`.
2. Export params schema + poll ingress from agent `src/ingress.ts`.
3. Add registrar under `src/polling/registrars/` and bind in `poll-source-registry.ts`.
4. List source in manifest `pollers[]`.
5. Add a poll scenario in `scenarios/**/*.scenarios.json` with `manifests[]` including your manifest `name`.
