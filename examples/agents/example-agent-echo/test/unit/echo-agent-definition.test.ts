import { describe, expect, it } from 'vitest';

import { exampleEchoAgent } from '../../src/echo-agent.definition.js';

describe('exampleEchoAgent definition', () => {
  it('declares example-echo handles', () => {
    expect(exampleEchoAgent.name).toBe('example-echo');
    expect(exampleEchoAgent.handles).toEqual(['example.ping.v1']);
    expect(typeof exampleEchoAgent.run).toBe('function');
  });
});
