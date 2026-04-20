import { describe, expect, it } from 'vitest';

import {
  NOTIFIER_AGENT_NAME,
  notifierAgentDefinition,
} from '../../src/agent.js';

describe('notifierAgentDefinition', () => {
  it('registers notify-ticket reactor', () => {
    expect(notifierAgentDefinition.name).toBe(NOTIFIER_AGENT_NAME);
    expect(notifierAgentDefinition.reactors.map((r) => r.name)).toEqual([
      'notify-ticket',
    ]);
  });
});
