import { defineAgent, defineReactor } from 'runtime-agent';
import { EXAMPLE_AGENT_DIALOGUE_RESPONDER } from 'runtime-events';

export const DIALOGUE_RESPONDER_AGENT_NAME = EXAMPLE_AGENT_DIALOGUE_RESPONDER;

export const dialogueResponderAgentDefinition = defineAgent({
  name: DIALOGUE_RESPONDER_AGENT_NAME,
  reactors: [
    defineReactor({
      name: 'answer-question',
      subscribesTo: ['chat.question.v1'],
      handler: async (event, ctx) => {
        const data = event.data as { text?: unknown };
        const text = typeof data.text === 'string' ? data.text : '';
        await ctx.emit(
          'chat.answer.v1',
          {
            reply: `Re: "${text}" — noted by the responder agent.`,
            question_event_id: event.id,
          },
          { externalId: `chat-answer:${event.id}` },
        );
      },
    }),
  ],
});
