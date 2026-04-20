# agent-test-harness

End-to-end test harness for agents under `agents/*` and `examples/agents/*`.

Wraps the runtime worker integration utilities (`withIsolatedStreamsStore`, `bootstrapTestWorker`, polling helpers) so agent packages can run full ingress → store → queue → reactor flows with the same worker path as production.

## Usage

```ts
import {
  runAgentE2e,
  integrationInfraAvailable,
  expectAgentRunSucceeded,
  expectEventType,
} from 'agent-test-harness';

describe.skipIf(!integrationInfraAvailable)('my agent e2e', () => {
  it('runs the happy path', async () => {
    await runAgentE2e({
      createAgents: ({ repoRoot }) => [/* defineAgent with fixture deps */],
      run: async ({ pool, fixturePath }) => {
        // emit ingress, then assert run + outcome events
      },
    });
  });

  it('sqlite-backed agent (optional)', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'e2e-sqlite-'));
    try {
      await runAgentE2e({
        agentSqlite: {
          baseDir,
          lockTimeoutMs: 30_000,
          migrationMaxMsPerMigration: 300_000,
        },
        createAgents: () => [/* defineAgent with sqlite.migrations */],
        run: async ({ pool }) => {
          // …
        },
      });
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
```

Requires local Postgres and Redis (`npm run dev:infra`). See `examples/agents/example-agent-echo/test/integration/echo-dev-once.e2e.test.ts` and `examples/agents/example-agent-notifier/test/integration/notifier.e2e.test.ts`.

Example agent packages are included in `npx nx run-many -t test --all` like application agents.
