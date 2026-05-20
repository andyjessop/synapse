# adapter-gitlab

## Source id

`synapse.adapters.gitlab.v1`

## Methods

| Method | Description |
| --- | --- |
| `fetchChanges` | Fetch GitLab merge request file changes |

## Why this is an adapter

- Bounded GitLab HTTP IO with JSON params and results
- Scenario curriculum uses FIFO fixtures via `apps/adapters`
- Ingress and worker share the same adapter RPC process and queues
- GitLab tokens stay in `apps/adapters` env, not agent handlers

## Params and result

**Params:** `{ projectId: number, mergeRequestIid: number, mergeRequestId?: number }`

**Result:** `{ project_id, merge_request_iid, changes[] }` per `gitLabMrChangesSchema` in `src/contracts.ts` / `src/schemas.ts`

## Package exports

| Import path | Consumers | Contents |
| --- | --- | --- |
| `adapter-gitlab` | `agents/*`, `pi-harness` | Contracts only (types + `gitLabMrChangesSchema`) |
| `adapter-gitlab/methods` | `apps/adapters` | `gitlabFetchChangesMethod` |
| `adapter-gitlab/live` | `apps/adapters` | Live GitLab client factory |
| `adapter-gitlab/fixtures` | Tests, fixture tooling | Fixture JSON parsers |
| `adapter-gitlab/testing` | Unit tests only | Legacy mock/fixture clients |

Do not import from `runtime-manifest` for GitLab shapes.

## Scenario fixture example

```json
{
  "source": "synapse.adapters.gitlab.v1",
  "method": "fetchChanges",
  "params": { "projectId": 202, "mergeRequestIid": 42 },
  "returns": { "file": "fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse-result.json" }
}
```

## Operational notes

- Live invokes require `GITLAB_TOKEN` on `apps/adapters`
- Optional `GITLAB_BASE_URL` (default `https://gitlab.com`)

## Non-goals

- Pi harness streaming review (`libs/pi-harness`) — in-process only, not this adapter
