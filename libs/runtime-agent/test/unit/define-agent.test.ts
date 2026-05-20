import { describe, expect, it } from 'vitest';

import {
  type AgentDefinition,
  defineAgent,
} from '../../src/agent-definition.js';

const stubRun: AgentDefinition['run'] = async () => {};

describe('defineAgent', () => {
  it('accepts a valid agent definition', () => {
    const def = defineAgent({
      name: 'agent-reviewer',
      handles: ['pr.received.v1'],
      usesAdapters: ['synapse.adapters.gitlab.v1'],
      run: stubRun,
    });
    expect(def.name).toBe('agent-reviewer');
  });

  it('rejects invalid agent name', () => {
    expect(() =>
      defineAgent({
        name: 'bad-name',
        handles: ['example.ping.v1'],
        run: stubRun,
      }),
    ).toThrow(/Invalid agent name/);
  });

  it('rejects invalid handle pattern', () => {
    expect(() =>
      defineAgent({
        name: 'example-echo',
        handles: ['not-a-versioned-event'],
        run: stubRun,
      }),
    ).toThrow(/Invalid event type handle/);
  });

  it('accepts hyphenated event types', () => {
    expect(() =>
      defineAgent({
        name: 'example-echo',
        handles: ['example.ping.v1'],
        run: stubRun,
      }),
    ).not.toThrow();
  });

  it('rejects invalid usesAdapters source id', () => {
    expect(() =>
      defineAgent({
        name: 'agent-reviewer',
        handles: ['pr.received.v1'],
        usesAdapters: ['bad.adapter'],
        run: stubRun,
      }),
    ).toThrow(/Invalid usesAdapters/);
  });
});
