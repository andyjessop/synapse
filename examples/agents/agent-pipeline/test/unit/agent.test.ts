import { describe, expect, it } from 'vitest';

import {
  PIPELINE_AGENT_NAME,
  pipelineAgentDefinition,
} from '../../src/agent.js';

describe('pipelineAgentDefinition', () => {
  it('chains parse-raw then finalize reactors', () => {
    expect(pipelineAgentDefinition.name).toBe(PIPELINE_AGENT_NAME);
    expect(pipelineAgentDefinition.reactors.map((r) => r.name)).toEqual([
      'parse-raw',
      'finalize',
    ]);
  });
});
