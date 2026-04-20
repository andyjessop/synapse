import { describe, expect, it } from 'vitest';

import {
  SPLITTER_AGENT_NAME,
  splitterAgentDefinition,
} from '../../src/agent.js';

describe('splitterAgentDefinition', () => {
  it('fans out to email and slack reactors', () => {
    expect(splitterAgentDefinition.name).toBe(SPLITTER_AGENT_NAME);
    expect(splitterAgentDefinition.reactors.map((r) => r.name)).toEqual([
      'notify-email',
      'notify-slack',
    ]);
  });
});
