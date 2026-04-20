import { defineAgentHandler } from 'runtime-agent';
import { z } from 'zod';

const pingDataSchema = z
  .object({
    message: z.string().optional(),
  })
  .strict();

export default defineAgentHandler(pingDataSchema, async (ctx, event) => {
  const message =
    typeof event.data.message === 'string' ? event.data.message : '';
  await ctx.emit(
    'example.pong.v1',
    {
      echo: message,
      ping_event_id: event.id,
    },
    { externalId: `example-pong:${event.id}` },
  );
});
