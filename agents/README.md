# Application agents

Capability agents shipped with the product worker. **Not** the example curriculum under `examples/agents/`.

| Agent | Package | Manifest | Scenario id | Purpose |
| --- | --- | --- | --- | --- |
| Reviewer | `agent-reviewer` | `manifests/application.json` | `review-pr/gitlab-synapse` | GitLab MR review via Pi |

## Run locally

```bash
npm run dev:infra
npm run dev
npm run dev:once -- --scenario review-pr/gitlab-synapse
```

Default **`npm run dev`** loads `manifests/application.json` and prints `synapse manifest:` at startup.

Set **`AGENT_REVIEWER_HERMETIC=1`** before **`npm run dev`** for Pi fixture mode without OpenAI.

## Tests

```bash
npx nx run agent-reviewer:test
```

## Documentation

- Per-agent: `agents/agent-reviewer/README.md`
- [Runtime manifest](../docs/reference/runtime-manifest.md)
- [Agent reference](../docs/reference/agents.md)
- [Create an application agent](../docs/how-to/create-an-agent.md)
