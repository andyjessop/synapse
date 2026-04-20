import { defineAgent, defineReactor } from 'runtime-agent';
import { EXAMPLE_AGENT_PIPELINE } from 'runtime-events';

export const PIPELINE_AGENT_NAME = EXAMPLE_AGENT_PIPELINE;

export const pipelineAgentDefinition = defineAgent({
  name: PIPELINE_AGENT_NAME,
  reactors: [
    defineReactor({
      name: 'parse-raw',
      subscribesTo: ['pipeline.raw.v1'],
      handler: async (event, ctx) => {
        const data = event.data as { payload?: unknown };
        const payload = typeof data.payload === 'string' ? data.payload : '';
        const lines = payload
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        await ctx.emit(
          'pipeline.parsed.v1',
          { lines, input_event_id: event.id },
          { externalId: `pipeline-parsed:${event.id}` },
        );
      },
    }),
    defineReactor({
      name: 'finalize',
      subscribesTo: ['pipeline.parsed.v1'],
      handler: async (event, ctx) => {
        const data = event.data as {
          lines?: unknown;
          input_event_id?: unknown;
        };
        const lines = Array.isArray(data.lines)
          ? data.lines.filter((l): l is string => typeof l === 'string')
          : [];
        const inputEventId =
          typeof data.input_event_id === 'string'
            ? data.input_event_id
            : event.id;
        await ctx.emit(
          'pipeline.done.v1',
          {
            line_count: lines.length,
            input_event_id: inputEventId,
          },
          { externalId: `pipeline-done:${event.id}` },
        );
      },
    }),
  ],
});
