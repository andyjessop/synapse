import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import type { SynapseEvent } from 'runtime-agent';
import type { RuntimePool } from 'runtime-store';
import { createIngressContext } from 'runtime-worker';
import { z } from 'zod';

import { NOTIFIER_AGENT_NAME } from './agent.js';

export const NOTIFIER_INGRESS_SOURCE =
  'synapse://example/agent-notifier/ingress' as const;

const ticketFixtureSchema = z
  .object({
    ticket_id: z.string().min(1),
    title: z.string().min(1),
    body: z.string(),
  })
  .strict();

export type TriggerTicketOpenedInput = {
  pool: RuntimePool;
  repoRoot: string;
  fixtureFile?: string;
  /** When set, skips fixture file read (e.g. HTTP webhook body). */
  ticket?: z.infer<typeof ticketFixtureSchema>;
};

/** Repo-relative or absolute fixture path for tests (cwd may not be repo root). */
export function resolveIngressFixturePath(
  repoRoot: string,
  fixtureFile: string | undefined,
  defaultRepoRelative: string,
): string {
  const rel = fixtureFile ?? defaultRepoRelative;
  return isAbsolute(rel) ? rel : join(repoRoot, rel);
}

/** Webhook-shaped fixture ingress → `ticket.opened.v1`. */
export async function triggerTicketOpened(
  input: TriggerTicketOpenedInput,
): Promise<SynapseEvent> {
  const ticket =
    input.ticket ??
    ticketFixtureSchema.parse(
      JSON.parse(
        readFileSync(
          resolveIngressFixturePath(
            input.repoRoot,
            input.fixtureFile,
            'examples/fixtures/agent-notifier/ticket-opened.json',
          ),
          'utf8',
        ),
      ),
    );
  const ctx = createIngressContext({
    agent: NOTIFIER_AGENT_NAME,
    source: NOTIFIER_INGRESS_SOURCE,
    store: input.pool,
  });
  return ctx.emit('ticket.opened.v1', ticket, {
    source: NOTIFIER_INGRESS_SOURCE,
    subject: ticket.ticket_id,
    externalId: `ticket-opened:${ticket.ticket_id}`,
  });
}
