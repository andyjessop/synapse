import { describe, expect, it } from 'vitest';
import { defineAgent, defineReactor } from '../../src/index';

describe('runtime-agent', () => {
  it('defineAgent returns the same agent definition', () => {
    const reactor = defineReactor({
      name: 'example',
      subscribesTo: ['example.ping.v1'],
      handler: async () => {},
    });
    const agent = defineAgent({
      name: 'example-echo',
      reactors: [reactor],
    });
    expect(agent.name).toBe('example-echo');
    expect(agent.reactors[0]?.name).toBe('example');
  });
});
