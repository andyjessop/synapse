import { defineAgent, defineReactor } from 'runtime-agent';
import { describe, expect, it } from 'vitest';
import { createRuntimeRegistry } from '../../src/registry';

describe('createRuntimeRegistry', () => {
  it('matches reactors by subscribed event type', () => {
    const reactor = defineReactor({
      name: 'handle-ping',
      subscribesTo: ['example.ping.v1'],
      handler: async () => {},
    });
    const registry = createRuntimeRegistry([
      defineAgent({ name: 'example-echo', reactors: [reactor] }),
    ]);

    const matched = registry.matchReactors('example.ping.v1');
    expect(matched).toHaveLength(1);
    expect(matched[0]?.agentName).toBe('example-echo');
    expect(matched[0]?.reactorName).toBe('handle-ping');
    expect(typeof matched[0]?.handler).toBe('function');
    expect(registry.matchReactors('example.other.v1')).toEqual([]);
  });

  it('rejects duplicate agents, duplicate reactors, and empty subscriptions', () => {
    const reactor = defineReactor({
      name: 'handle-ping',
      subscribesTo: ['example.ping.v1'],
      handler: async () => {},
    });

    expect(() =>
      createRuntimeRegistry([
        defineAgent({ name: 'dup', reactors: [reactor] }),
        defineAgent({ name: 'dup', reactors: [reactor] }),
      ]),
    ).toThrow(/Duplicate agent/);

    expect(() =>
      createRuntimeRegistry([
        defineAgent({ name: 'agent', reactors: [reactor, reactor] }),
      ]),
    ).toThrow(/Duplicate reactor/);

    expect(() =>
      createRuntimeRegistry([
        defineAgent({
          name: 'agent',
          reactors: [
            defineReactor({
              name: 'empty',
              subscribesTo: [],
              handler: async () => {},
            }),
          ],
        }),
      ]),
    ).toThrow(/subscribe/);
  });

  it('rejects agent names outside the SQLite slug charset', () => {
    expect(() =>
      createRuntimeRegistry([
        defineAgent({
          name: 'Invalid_Case',
          reactors: [
            defineReactor({
              name: 'r',
              subscribesTo: ['example.ping.v1'],
              handler: async () => {},
            }),
          ],
        }),
      ]),
    ).toThrow(/Agent name must match/);
  });
});
