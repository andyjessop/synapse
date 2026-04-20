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
  SQLITE_NOTEBOOK_AGENT_NAME,
  sqliteNotebookAgentDefinition,
} from '../../src/agent.js';
import { triggerSqliteNotebookAppend } from '../../src/ingress.js';

describe.skipIf(!integrationInfraAvailable)(
  'example-agent-sqlite-notebook (e2e)',
  () => {
    it('stores a note row and emits example.sqlite.note.stored.v1', async () => {
      const baseDir = mkdtempSync(join(tmpdir(), 'syn-e2e-sqlite-notebook-'));
      try {
        await runAgentE2e({
          agentSqlite: {
            baseDir,
            lockTimeoutMs: 30_000,
            migrationMaxMsPerMigration: 300_000,
          },
          createAgents: () => [sqliteNotebookAgentDefinition],
          run: async ({ pool }) => {
            const body = 'integration test body';
            const ingress = await triggerSqliteNotebookAppend({
              pool,
              subject: 'e2e-subject',
              body,
            });
            await expectAgentRunSucceeded(pool, {
              agentName: SQLITE_NOTEBOOK_AGENT_NAME,
              reactorName: 'append-note',
              inputEventId: ingress.id,
            });
            const stored = await expectEventType(
              pool,
              'example.sqlite.note.stored.v1',
              { rootId: ingress.rootId },
            );
            expect(stored.data).toMatchObject({
              subject: 'e2e-subject',
              char_count: body.length,
              input_event_id: ingress.id,
            });
            expect(typeof (stored.data as { note_id: string }).note_id).toBe(
              'string',
            );
          },
        });
      } finally {
        rmSync(baseDir, { recursive: true, force: true });
      }
    });
  },
);
