import { describe, expect, it } from 'vitest';
import { parseIngressEnv } from '../../src/env.js';

describe('parseIngressEnv', () => {
  it('applies defaults and resolves database URL from runtime config', () => {
    const env = parseIngressEnv({});
    expect(env.INGRESS_HOST).toBe('127.0.0.1');
    expect(env.INGRESS_PORT).toBe(3102);
    expect(env.WEBHOOKS_HOST).toBe('127.0.0.1');
    expect(env.WEBHOOKS_PORT).toBe(3102);
    expect(env.SYNAPSE_RUNTIME_MANIFEST).toBeUndefined();
    expect(env.databaseUrl).toBe(
      'postgresql://synapse:synapse@127.0.0.1:25432/synapse',
    );
  });
});
