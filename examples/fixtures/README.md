# Example fixtures

Static **fixture contract** payloads for packages under `examples/agents/`. Application agents use repo-root `fixtures/<agent-name>/` instead.

Each HTTP-capable example should have:

- A `*.fixture.json` under `examples/fixtures/<package>/` (validated by `synapseFixtureSchema`)
- The fixture path listed on the owning agent in the example manifest (`agents[].fixtures`)
- `webhooks.routes` listing example route ids on the manifest when ingress goes through `apps/webhooks`

Local proof:

```bash
npm run dev -- --manifest manifests/examples/echo.json
npm run dev:once -- --fixture example/echo
```

Same fixture paths are used in `withTestDevServer` + `runDevOnce` integration tests.
