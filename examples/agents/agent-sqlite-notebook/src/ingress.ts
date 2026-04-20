import { randomUUID } from 'node:crypto';

import type { SynapseEvent } from 'runtime-agent';
import type { RuntimePool } from 'runtime-store';
import { createIngressContext } from 'runtime-worker';

import { SQLITE_NOTEBOOK_AGENT_NAME } from './agent.js';

export const SQLITE_NOTEBOOK_INGRESS_SOURCE =
  'synapse://example/sqlite-notebook' as const;

export type TriggerSqliteNotebookAppendInput = {
  pool: RuntimePool;
  subject?: string;
  body?: string;
};

/** Emit `example.sqlite.note.append.v1` (integration tests). */
export async function triggerSqliteNotebookAppend(
  input: TriggerSqliteNotebookAppendInput,
): Promise<SynapseEvent> {
  const subject = input.subject ?? 'dev-once';
  const body = input.body ?? 'hello from sqlite notebook';
  const token = randomUUID();
  const ctx = createIngressContext({
    agent: SQLITE_NOTEBOOK_AGENT_NAME,
    source: SQLITE_NOTEBOOK_INGRESS_SOURCE,
    store: input.pool,
  });
  return ctx.emit(
    'example.sqlite.note.append.v1',
    { subject, body },
    {
      source: SQLITE_NOTEBOOK_INGRESS_SOURCE,
      subject: token,
      externalId: `sqlite-note-append:${token}`,
    },
  );
}
