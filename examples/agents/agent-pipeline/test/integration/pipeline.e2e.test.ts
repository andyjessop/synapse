import {
  expectAgentRunSucceeded,
  expectEventType,
  integrationInfraAvailable,
  runAgentE2e,
} from 'agent-test-harness';
import { describe, expect, it } from 'vitest';

import { pipelineAgentDefinition } from '../../src/agent.js';
import { triggerPipeline } from '../../src/ingress.js';

describe.skipIf(!integrationInfraAvailable)(
  'example-agent-pipeline (e2e)',
  () => {
    it('pipeline.raw → parsed → done', async () => {
      await runAgentE2e({
        createAgents: () => [pipelineAgentDefinition],
        run: async ({ pool }) => {
          const raw = await triggerPipeline({ pool, payload: 'one\n\ntwo' });

          await expectAgentRunSucceeded(pool, {
            agentName: 'example-agent-pipeline',
            reactorName: 'parse-raw',
            inputEventId: raw.id,
          });

          const parsed = await expectEventType(pool, 'pipeline.parsed.v1', {
            rootId: raw.rootId,
          });
          expect(parsed.data).toMatchObject({
            lines: ['one', 'two'],
            input_event_id: raw.id,
          });

          await expectAgentRunSucceeded(pool, {
            agentName: 'example-agent-pipeline',
            reactorName: 'finalize',
            inputEventId: parsed.id,
          });

          const done = await expectEventType(pool, 'pipeline.done.v1', {
            rootId: raw.rootId,
          });
          expect(done.data).toMatchObject({
            line_count: 2,
            input_event_id: raw.id,
          });
        },
      });
    });
  },
);
