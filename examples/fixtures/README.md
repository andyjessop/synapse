# Example fixtures

Static **payload** and **adapter stub** files for packages under `examples/agents/`. Application agents use repo-root `fixtures/<agent-name>/` instead.

Each HTTP-capable example should have:

- Payload JSON under `examples/fixtures/<package>/`
- A scenario under `scenarios/` with `ingress.fixtures[].file` pointing at those payloads
- The scenario path listed on manifest `scenarios[]`
- Matching `webhooks[]` / `pollers[]` on the example manifest

Local proof:

```bash
npm run dev -- --manifest manifests/examples/echo.json
npm run dev:once -- --scenario example/echo
```

Same scenario ids are used in `withTestDevServer` + `runDevOnce` integration tests.
