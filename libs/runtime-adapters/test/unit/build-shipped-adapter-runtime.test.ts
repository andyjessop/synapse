import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildShippedAdapterRuntime } from '../../src/build-shipped-adapter-runtime.js';
import { defineAdapterMethod } from '../../src/define-adapter-method.js';
import { defineAdapterSource } from '../../src/define-adapter-source.js';

describe('buildShippedAdapterRuntime', () => {
  const testSource = defineAdapterSource({
    source: 'synapse.adapters.test.v1',
    description: 'test',
    createLiveDeps: (env) =>
      env.TOKEN === 'set' ? { token: env.TOKEN } : undefined,
    methods: {
      ping: defineAdapterMethod({
        source: 'synapse.adapters.test.v1',
        method: 'ping',
        description: 'ping',
        boundary: {
          reason: 'test',
          scenarioFixtureable: true,
          sharedAcrossProcesses: true,
        },
        paramsSchema: z.object({}).strict(),
        resultSchema: z.object({ ok: z.literal(true) }).strict(),
        invokeLive: async () => ({ ok: true as const }),
      }),
    },
  });

  it('builds registry and catalog from sources', () => {
    const built = buildShippedAdapterRuntime([testSource]);
    expect(
      built.shippedAdapterSources['synapse.adapters.test.v1']?.methods,
    ).toEqual(['ping']);
    expect(
      built.methodRegistry.get('synapse.adapters.test.v1', 'ping'),
    ).toBeDefined();
  });

  it('omits live deps when createLiveDeps returns undefined', () => {
    const built = buildShippedAdapterRuntime([testSource]);
    const deps = built.createLiveDeps({});
    expect(deps['synapse.adapters.test.v1']).toBeUndefined();
    const withToken = built.createLiveDeps({ TOKEN: 'set' });
    expect(withToken['synapse.adapters.test.v1']).toEqual({ token: 'set' });
  });

  it('throws on duplicate adapter source id', () => {
    expect(() =>
      buildShippedAdapterRuntime([
        testSource,
        defineAdapterSource({
          ...testSource,
          methods: testSource.methods,
        }),
      ]),
    ).toThrow(/Adapter source registered twice: synapse\.adapters\.test\.v1/);
  });
});
