import {
  expectAgentRunSucceeded,
  expectEventType,
  integrationInfraAvailable,
  runAgentE2e,
} from 'agent-test-harness';
import { describe, expect, it } from 'vitest';

import { splitterAgentDefinition } from '../../src/agent.js';
import { triggerBroadcast } from '../../src/ingress.js';

describe.skipIf(!integrationInfraAvailable)(
  'example-agent-splitter (e2e)',
  () => {
    it('notify.broadcast fans out to email and slack outcomes', async () => {
      await runAgentE2e({
        createAgents: () => [splitterAgentDefinition],
        run: async ({ pool }) => {
          const broadcast = await triggerBroadcast({
            pool,
            message: 'ship it',
          });

          await expectAgentRunSucceeded(pool, {
            agentName: 'example-agent-splitter',
            reactorName: 'notify-email',
            inputEventId: broadcast.id,
          });
          await expectAgentRunSucceeded(pool, {
            agentName: 'example-agent-splitter',
            reactorName: 'notify-slack',
            inputEventId: broadcast.id,
          });

          const email = await expectEventType(pool, 'notify.email.v1', {
            rootId: broadcast.rootId,
          });
          const slack = await expectEventType(pool, 'notify.slack.v1', {
            rootId: broadcast.rootId,
          });
          expect(email.data).toMatchObject({
            channel: 'email',
            body: '[email] ship it',
            input_event_id: broadcast.id,
          });
          expect(slack.data).toMatchObject({
            channel: 'slack',
            body: '[slack] ship it',
            input_event_id: broadcast.id,
          });
        },
      });
    });
  },
);
