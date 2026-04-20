import { describe, expect, it } from 'vitest';
import { defineAgent, defineReactor } from '../../src/index';

describe('runtime-agent definition validation', () => {
  it('returns reactor definitions unchanged', () => {
    const reactor = defineReactor({
      name: 'react',
      subscribesTo: ['ticket.opened.v1'],
      handler: async () => undefined,
    });

    expect(reactor).toMatchObject({
      name: 'react',
      subscribesTo: ['ticket.opened.v1'],
    });
  });

  it('returns agent definitions unchanged', () => {
    const reactor = defineReactor({
      name: 'react',
      subscribesTo: ['ticket.opened.v1'],
      handler: async () => undefined,
    });
    const agent = defineAgent({
      name: 'example-agent-notifier',
      reactors: [reactor],
    });

    expect(agent).toMatchObject({
      name: 'example-agent-notifier',
      reactors: [reactor],
    });
  });
});
