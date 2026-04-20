import {
  expectAgentRunSucceeded,
  expectEventType,
  integrationInfraAvailable,
  runAgentE2e,
} from 'agent-test-harness';
import { describe, expect, it } from 'vitest';

import { notifierAgentDefinition } from '../../src/agent.js';
import { triggerTicketOpened } from '../../src/ingress.js';

describe.skipIf(!integrationInfraAvailable)(
  'example-agent-notifier (e2e)',
  () => {
    it('ticket.opened.v1 → ticket.notified.v1', async () => {
      await runAgentE2e({
        createAgents: () => [notifierAgentDefinition],
        run: async ({ pool, repoRoot }) => {
          const ingressEvent = await triggerTicketOpened({ pool, repoRoot });

          await expectAgentRunSucceeded(pool, {
            agentName: 'example-agent-notifier',
            reactorName: 'notify-ticket',
            inputEventId: ingressEvent.id,
          });

          const notified = await expectEventType(pool, 'ticket.notified.v1', {
            rootId: ingressEvent.rootId,
          });
          expect(notified.data).toMatchObject({
            ticket_id: 'DEV-42',
            comment_markdown: 'Notified for **Example ticket** (DEV-42).',
            input_event_id: ingressEvent.id,
          });
        },
      });
    });
  },
);
