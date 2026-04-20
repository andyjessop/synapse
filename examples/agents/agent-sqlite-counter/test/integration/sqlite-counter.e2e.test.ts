import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  expectAgentRunSucceeded,
  expectEventType,
  integrationInfraAvailable,
  runAgentE2e,
} from 'agent-test-harness';
import { describe, expect, it } from 'vitest';

import {
  SQLITE_COUNTER_AGENT_NAME,
  sqliteCounterAgentDefinition,
} from '../../src/agent.js';
import { triggerSqliteCounterRequest } from '../../src/ingress.js';

describe.skipIf(!integrationInfraAvailable)(
  'example-agent-sqlite-counter (e2e)',
  () => {
    it('persists visit counts in sqlite across two requests for the same token', async () => {
      const baseDir = mkdtempSync(join(tmpdir(), 'syn-e2e-sqlite-counter-'));
      try {
        await runAgentE2e({
          agentSqlite: {
            baseDir,
            lockTimeoutMs: 30_000,
            migrationMaxMsPerMigration: 300_000,
          },
          createAgents: () => [sqliteCounterAgentDefinition],
          run: async ({ pool }) => {
            const token = `e2e-${Date.now()}`;
            const first = await triggerSqliteCounterRequest({
              pool,
              pingToken: token,
            });
            await expectAgentRunSucceeded(pool, {
              agentName: SQLITE_COUNTER_AGENT_NAME,
              reactorName: 'count-request',
              inputEventId: first.id,
            });
            const u1 = await expectEventType(
              pool,
              'example.sqlite.count.updated.v1',
              { rootId: first.rootId },
            );
            expect(u1.data).toMatchObject({
              ping_token: token,
              count_after: 1,
              input_event_id: first.id,
            });

            const second = await triggerSqliteCounterRequest({
              pool,
              pingToken: token,
            });
            await expectAgentRunSucceeded(pool, {
              agentName: SQLITE_COUNTER_AGENT_NAME,
              reactorName: 'count-request',
              inputEventId: second.id,
            });
            const u2 = await expectEventType(
              pool,
              'example.sqlite.count.updated.v1',
              { rootId: second.rootId },
            );
            expect(u2.data).toMatchObject({
              ping_token: token,
              count_after: 2,
              input_event_id: second.id,
            });
          },
        });
      } finally {
        rmSync(baseDir, { recursive: true, force: true });
      }
    });
  },
);
