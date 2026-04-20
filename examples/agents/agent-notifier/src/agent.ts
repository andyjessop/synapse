import { defineAgent, defineReactor } from 'runtime-agent';
import { EXAMPLE_AGENT_NOTIFIER } from 'runtime-events';

export const NOTIFIER_AGENT_NAME = EXAMPLE_AGENT_NOTIFIER;

export const notifierAgentDefinition = defineAgent({
  name: NOTIFIER_AGENT_NAME,
  reactors: [
    defineReactor({
      name: 'notify-ticket',
      subscribesTo: ['ticket.opened.v1'],
      handler: async (event, ctx) => {
        const data = event.data as {
          ticket_id?: unknown;
          title?: unknown;
        };
        const ticketId =
          typeof data.ticket_id === 'string' ? data.ticket_id : 'unknown';
        const title = typeof data.title === 'string' ? data.title : 'ticket';
        await ctx.emit(
          'ticket.notified.v1',
          {
            ticket_id: ticketId,
            comment_markdown: `Notified for **${title}** (${ticketId}).`,
            input_event_id: event.id,
          },
          { externalId: `ticket-notified:${event.id}` },
        );
      },
    }),
  ],
});
