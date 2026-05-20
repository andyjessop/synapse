# agent-reviewer

Manifest agent **`agent-reviewer`**: GitLab merge-request webhook ingress → **`pr.received.v1`** → **`review-pr`** handler (Pi review) → **`pr.reviewed.v1`**.

Definition: `src/review-pr-agent.definition.ts` (`defineAgent`, `usesAdapters: ['synapse.adapters.gitlab.v1']`). Registered in `apps/worker/src/shipped-agents.ts`.

## Local development

Agent handler breakpoints use VS Code **`dev (worker inspect)`** (worker on port **9230**), not **`dev:once`**. See [Local agent development](../../docs/how-to/local-agent-development.md#debug-agent-handlers-breakpoints).

Start the stack, then run the scenario:

```bash
npm run dev
npm run dev:once -- --scenario review-pr/gitlab-synapse
```

**Default (`npm run dev`):** live **Pi SDK**; GitLab via **`ctx.adapters.invoke`** (live `GITLAB_TOKEN` or scenario FIFO mocks during `dev:once`). Requires **`OPENAI_API_KEY`** in repo-root **`.env.local`** (or Pi auth under `~/.pi/agent`) for live review. Default model: **`openai/gpt-5.4-mini`** (`PI_REVIEW_MODEL`).

**Hermetic Pi:** set **`AGENT_REVIEWER_HERMETIC=1`** before **`npm run dev`** for Pi fixture mode (no OpenAI). GitLab stubs for `dev:once` come from **`adapters[]`** on `scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json`.

## Manifest mount

```json
{
  "agents": [{ "name": "agent-reviewer" }],
  "webhooks": [{ "source": "synapse.webhooks.prs.v1" }],
  "adapters": [{ "source": "synapse.adapters.gitlab.v1" }]
}
```

Scenario file `scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json` declares `"manifests": ["application-default", "debug-reviewer-only"]`.

## Static files (`fixtures/agent-reviewer/`)

| File | Role |
| --- | --- |
| `gitlab-merge-request.json` | Webhook payload (`ingress.fixtures[].file`) |
| `adapters/gitlab-fetch-changes-synapse-result.json` | GitLab `fetchChanges` return stub (scenario `adapters[]`) |

## Tests

```bash
npx nx run agent-reviewer:test
```

Unit tests cover ingress, the review handler (with injected Pi client), and schemas. End-to-end proof: **`npm run dev`** + **`npm run dev:once -- --scenario review-pr/gitlab-synapse`** (live Pi by default, or **`AGENT_REVIEWER_HERMETIC=1`** without an LLM).
