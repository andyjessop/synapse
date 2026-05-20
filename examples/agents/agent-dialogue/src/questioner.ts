import { defineReactor, defineRegistryAgent } from 'runtime-agent';
import { EXAMPLE_AGENT_DIALOGUE_QUESTIONER } from 'runtime-events';

export const DIALOGUE_QUESTIONER_AGENT_NAME = EXAMPLE_AGENT_DIALOGUE_QUESTIONER;

export const dialogueQuestionerAgentDefinition = defineRegistryAgent({
  name: DIALOGUE_QUESTIONER_AGENT_NAME,
  reactors: [
    defineReactor({
      name: 'close-dialogue',
      subscribesTo: ['chat.answer.v1'],
      handler: async (event, ctx) => {
        const data = event.data as {
          question_event_id?: unknown;
        };
        const questionEventId =
          typeof data.question_event_id === 'string'
            ? data.question_event_id
            : event.id;
        await ctx.emit(
          'chat.closed.v1',
          {
            question_event_id: questionEventId,
            answer_event_id: event.id,
            summary: 'Questioner received the responder answer.',
          },
          { externalId: `chat-closed:${event.id}` },
        );
      },
    }),
  ],
});
