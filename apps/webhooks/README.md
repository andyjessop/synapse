# webhooks

HTTP ingress for local Synapse development (Hono + OpenAPI at `/openapi.json`).

## Route registration

1. **Manifest** (`webhooks.routes`) lists stable route ids for this session, for example `synapse.webhooks.prs.v1`.
2. **Catalog** (`libs/runtime-manifest/src/webhook-route-catalog.ts`) maps each id to `method` + `path`.
3. **Registry** (`apps/webhooks/src/webhook-route-registry.ts`) maps each id to a `register*Routes` function that mounts Hono OpenAPI routes.

`npm run dev` sets `SYNAPSE_RUNTIME_MANIFEST`; `main.ts` loads the manifest and mounts only the listed routes. **`npm run dev:once`** fixtures use `ingress.method` + `ingress.path`; manifest validation requires those match a mounted route.

Default when `webhooks` is omitted from the manifest: `synapse.webhooks.prs.v1` only.

## Adding a route

1. Add the route handler under `src/routes/` (keep using `@hono/zod-openapi` `createRoute` + `app.openapi`).
2. Add the id, path, and `register` entry in `webhook-route-catalog.ts` and `webhook-route-registry.ts`.
3. List the id in the relevant `manifests/*.json` under `webhooks.routes`.
4. Add or update a `*.fixture.json` with matching `ingress.path`.
