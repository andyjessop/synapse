import { defineReactor, defineRegistryAgent } from 'runtime-agent';
import { EXAMPLE_AGENT_SPLITTER } from 'runtime-events';

export const SPLITTER_AGENT_NAME = EXAMPLE_AGENT_SPLITTER;

export const splitterAgentDefinition = defineRegistryAgent({
  name: SPLITTER_AGENT_NAME,
  reactors: [
    defineReactor({
      name: 'notify-email',
      subscribesTo: ['notify.broadcast.v1'],
      handler: async (event, ctx) => {
        const data = event.data as { message?: unknown };
        const message = typeof data.message === 'string' ? data.message : '';
        await ctx.emit(
          'notify.email.v1',
          {
            channel: 'email',
            body: `[email] ${message}`,
            input_event_id: event.id,
          },
          { externalId: `notify-email:${event.id}` },
        );
      },
    }),
    defineReactor({
      name: 'notify-slack',
      subscribesTo: ['notify.broadcast.v1'],
      handler: async (event, ctx) => {
        const data = event.data as { message?: unknown };
        const message = typeof data.message === 'string' ? data.message : '';
        await ctx.emit(
          'notify.slack.v1',
          {
            channel: 'slack',
            body: `[slack] ${message}`,
            input_event_id: event.id,
          },
          { externalId: `notify-slack:${event.id}` },
        );
      },
    }),
  ],
});
