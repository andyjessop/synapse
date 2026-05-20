import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineAdapterMethod } from '../../src/define-adapter-method.js';
import { defineAdapterSource } from '../../src/define-adapter-source.js';

describe('defineAdapterSource', () => {
  const method = defineAdapterMethod({
    source: 'synapse.adapters.test.v1',
    method: 'ping',
    description: 'test',
    boundary: {
      reason: 'test',
      scenarioFixtureable: true,
      sharedAcrossProcesses: true,
    },
    paramsSchema: z.object({ ok: z.literal(true) }).strict(),
    resultSchema: z.object({ ok: z.literal(true) }).strict(),
    invokeLive: async () => ({ ok: true as const }),
  });

  it('accepts a valid source definition', () => {
    const def = defineAdapterSource({
      source: 'synapse.adapters.test.v1',
      description: 'test source',
      createLiveDeps: () => ({ ready: true }),
      methods: { ping: method },
    });
    expect(def.source).toBe('synapse.adapters.test.v1');
  });

  it('rejects invalid source id', () => {
    expect(() =>
      defineAdapterSource({
        source: 'bad.source',
        description: 'x',
        createLiveDeps: () => ({}),
        methods: { ping: method },
      }),
    ).toThrow(/Invalid adapter source id/);
  });

  it('rejects method source mismatch', () => {
    const wrong = defineAdapterMethod({
      ...method,
      source: 'synapse.adapters.other.v1',
    });
    expect(() =>
      defineAdapterSource({
        source: 'synapse.adapters.test.v1',
        description: 'x',
        createLiveDeps: () => ({}),
        methods: { ping: wrong },
      }),
    ).toThrow(/does not match adapter source/);
  });
});
