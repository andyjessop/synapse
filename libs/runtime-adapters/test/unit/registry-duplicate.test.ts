import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineAdapterMethod } from '../../src/define-adapter-method.js';
import { registerAdapterMethods } from '../../src/registry.js';

describe('registerAdapterMethods', () => {
  it('fails when the same source.method is registered twice', () => {
    const method = defineAdapterMethod({
      source: 'synapse.adapters.gitlab.v1',
      method: 'fetchChanges',
      description: 'test duplicate',
      boundary: {
        reason: 'test',
        scenarioFixtureable: true,
        sharedAcrossProcesses: true,
      },
      paramsSchema: z.object({ id: z.number() }).strict(),
      resultSchema: z.object({ ok: z.boolean() }).strict(),
      invokeLive: async () => ({ ok: true }),
    });

    expect(() => registerAdapterMethods(method, method)).toThrow(
      /registered twice/,
    );
  });
});
