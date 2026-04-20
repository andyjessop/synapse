# pi-harness

**Pi Coding Agent harness** for in-repo agents: factories that satisfy `agent-reviewer`’s `PiReviewClient` today (`createPiReviewSdkClient`, `createPiReviewProcessClient`, `createPiReviewFixtureClient`) plus `PI_REVIEW_MODEL` parsing for local worker env.

This is **not** the client UI package (`libs/pi`, npm `pi`) and **not** part of the durable `runtime-*` event/store stack. It is the **adapter layer between Synapse worker processes and `@earendil-works/pi-coding-agent`** (and optional `pi` CLI / static fixture markdown). Any agent that defines a compatible prompt/result surface can depend on these factories the same way `apps/worker` does for dev adapters.

## Progress (local)

**`PI_HARNESS_PROGRESS`:** when enabled (`1`, `true`, `yes`, or **`stderr`**), the worker emits **one line per distinct activity**: **`read` / `grep` / `find` / `ls`** with **paths and patterns** (bounded, repo-relative when `repoRoot` is known; no full file contents), **throttled `thinking …`** snippets from the model’s thinking stream, and **`… failed`** only when a tool errors. Successful tool completions are silent to avoid duplicate noise. Consecutive duplicate lines are dropped.

**Sink:** By default, lines go to **stderr** with prefix **`[pi-harness]`**. When **`SYNAPSE_PI_HARNESS_PROGRESS_SNAPSHOT`** is set to a filesystem path, the harness instead maintains a small **rolling JSON snapshot** (`{ "lines": string[] }`) and does **not** write those lines to stderr (so TUIs can read the file and update a spinner). **`stderr`** mode always uses stderr only (no snapshot).

**Dev-once:** with **`npm run dev`** + **`npm run dev:once -- --fixture review-pr/gitlab-synapse`**, set **`PI_HARNESS_PROGRESS=1`** (unless already in `.env.local`) and optionally **`SYNAPSE_PI_HARNESS_PROGRESS_SNAPSHOT`** so interactive Clack can show the last few harness lines under **Waiting for …** without interleaving stderr into the spinner. Use **`PI_HARNESS_PROGRESS=stderr`** to skip the snapshot. Use **`PI_HARNESS_PROGRESS=0`** (or `false` / `no` / `off`) to silence.

**Custom tool:** `createPiReviewSdkClient` registers **`fetch_merge_request_diff`** when a **`adapter-gitlab`** `GitLabMergeRequestClient` is provided. Process and fixture clients do not register it.

**Synapse tool events:** When `PiReviewRequest.emitHarnessEvent` is set (the `review-pr` reactor does this), the SDK loads the **`synapse-pi-dev`** Pi extension (`libs/pi-harness/src/extensions/synapse-pi-dev-extension.ts`), which emits durable **`pi.tool-call.started.v1`** / **`pi.tool-call.completed.v1`** events for each Pi tool invocation. Each payload includes monotonic **`timeline_order`** (emit order for that review) so dev run artifacts and flow trees stay sequential when `createdAt` ties.

Optional tests / custom sinks: pass **`progressEmitLine`** on `createPiReviewSdkClient` input; when progress is enabled and no snapshot path is set, it overrides writing to stderr.

## Tests

From the repository root:

```bash
npx nx run pi-harness:test
```
