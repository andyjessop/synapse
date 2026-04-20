# agent-reviewer

Manifest agent **`agent-reviewer`**: GitLab merge-request webhook ingress → **`pr.received.v1`** → **`review-pr`** handler (Pi review) → **`pr.reviewed.v1`**.

## Local development

Start the stack, then post a run-loop fixture:

```bash
npm run dev
npm run dev:once -- --fixture review-pr/gitlab-synapse
```

**Default (`npm run dev`):** the handler loads **`fixtures.adapter`** from the active manifest (`manifests/application.json` by default) and uses **live Pi SDK** plus **GitLab adapter mock rules** (schema `libs/runtime-manifest/schemas/adapter/gitlab.fetchChanges.v1.schema.json`). Requires **`OPENAI_API_KEY`** in repo-root **`.env.local`** (or Pi auth under `~/.pi/agent`). Default model: **`openai/gpt-5.4-mini`** (`PI_REVIEW_MODEL`). Pi uses tool **`fetch_merge_request_diff`**; rules match on `projectId` / `mergeRequestIid`.

**Hermetic Pi:** set **`AGENT_REVIEWER_HERMETIC=1`** before **`npm run dev`** to use the Pi review adapter fixture schema (no OpenAI).

## Manifest row (application)

```json
"fixtures": {
  "webhook": [
    "fixtures/agent-reviewer/review-pr-gitlab-synapse.fixture.json"
  ],
  "adapter": [
    "fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json",
    "fixtures/agent-reviewer/adapters/pi-review-synapse.json"
  ]
}
```

Dev wiring: `src/configure-review-pr-dev-clients.ts` (imported from `review-pr-agent.ts`).

## Fixture files (`fixtures/agent-reviewer/`)

| File | Role |
| --- | --- |
| `review-pr-gitlab-synapse.fixture.json` | Run-loop contract (`run-loop.v1.schema.json`) |
| `gitlab-merge-request.json` | Webhook POST body |
| `adapters/gitlab-fetch-changes-synapse.json` | GitLab `fetchChanges` mock rule |
| `adapters/pi-review-synapse.json` | Pi `review` mock rule (hermetic) |

## Tests

```bash
npx nx run agent-reviewer:test
```

Unit tests cover ingress, the review handler (with an injected Pi client), manifest dev wiring, and schemas. End-to-end proof of the full run loop uses **`npm run dev`** + **`npm run dev:once -- --fixture review-pr/gitlab-synapse`** (live Pi by default, or **`AGENT_REVIEWER_HERMETIC=1`** without an LLM).
