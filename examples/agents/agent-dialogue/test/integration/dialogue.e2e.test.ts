import {
  expectAgentRunSucceeded,
  expectEventType,
  integrationInfraAvailable,
  runAgentE2e,
} from 'agent-test-harness';
import { describe, expect, it } from 'vitest';

import { dialogueAgentDefinitions } from '../../src/index.js';
import { triggerDialogue } from '../../src/ingress.js';

describe.skipIf(!integrationInfraAvailable)(
  'example-agent-dialogue (e2e)',
  () => {
    it('questioner → responder → questioner closes the dialogue', async () => {
      await runAgentE2e({
        createAgents: () => [...dialogueAgentDefinitions],
        run: async ({ pool }) => {
          const question = await triggerDialogue({ pool });

          await expectAgentRunSucceeded(pool, {
            agentName: 'example-agent-dialogue-responder',
            reactorName: 'answer-question',
            inputEventId: question.id,
          });

          const answer = await expectEventType(pool, 'chat.answer.v1', {
            rootId: question.rootId,
          });
          expect(answer.data).toMatchObject({
            reply: expect.stringContaining('multiple agents'),
            question_event_id: question.id,
          });

          await expectAgentRunSucceeded(pool, {
            agentName: 'example-agent-dialogue-questioner',
            reactorName: 'close-dialogue',
            inputEventId: answer.id,
          });

          const closed = await expectEventType(pool, 'chat.closed.v1', {
            rootId: question.rootId,
          });
          expect(closed.data).toMatchObject({
            question_event_id: question.id,
            answer_event_id: answer.id,
            summary: 'Questioner received the responder answer.',
          });
        },
      });
    });
  },
);
