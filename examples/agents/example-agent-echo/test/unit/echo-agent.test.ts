import { isAgentHandler } from 'runtime-agent';
import { describe, expect, it } from 'vitest';

import echoAgent from '../../src/echo-agent.js';

describe('echo-agent', () => {
  it('default export is an agent handler', () => {
    expect(isAgentHandler(echoAgent)).toBe(true);
  });
});
