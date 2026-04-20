import { describe, expect, it } from 'vitest';

import { dialogueAgentDefinitions } from '../../src/index.js';
import { DIALOGUE_QUESTIONER_AGENT_NAME } from '../../src/questioner.js';
import { DIALOGUE_RESPONDER_AGENT_NAME } from '../../src/responder.js';

describe('dialogue agent definitions', () => {
  it('registers questioner and responder as separate agents', () => {
    expect(dialogueAgentDefinitions).toHaveLength(2);
    expect(dialogueAgentDefinitions.map((agent) => agent.name)).toEqual([
      DIALOGUE_QUESTIONER_AGENT_NAME,
      DIALOGUE_RESPONDER_AGENT_NAME,
    ]);
    expect(
      dialogueAgentDefinitions[0]?.reactors.map((reactor) => reactor.name),
    ).toEqual(['close-dialogue']);
    expect(
      dialogueAgentDefinitions[1]?.reactors.map((reactor) => reactor.name),
    ).toEqual(['answer-question']);
  });
});
