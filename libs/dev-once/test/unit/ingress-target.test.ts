import { describe, expect, it } from 'vitest';
import {
  assertLoopbackIngressHost,
  buildIngressBaseUrl,
  parseIngressTargetFromEnv,
} from '../../src/ingress-target.js';

describe('ingress-target', () => {
  it('buildIngressBaseUrl uses host and port', () => {
    expect(buildIngressBaseUrl('127.0.0.1', 3102)).toBe(
      'http://127.0.0.1:3102',
    );
  });

  it('parseIngressTargetFromEnv prefers INGRESS_* over WEBHOOKS_*', () => {
    expect(
      parseIngressTargetFromEnv({
        INGRESS_HOST: '127.0.0.1',
        INGRESS_PORT: '3200',
        WEBHOOKS_HOST: '10.0.0.1',
        WEBHOOKS_PORT: '9999',
      }),
    ).toEqual({ INGRESS_HOST: '127.0.0.1', INGRESS_PORT: 3200 });
  });

  it('parseIngressTargetFromEnv falls back to WEBHOOKS_* aliases', () => {
    expect(
      parseIngressTargetFromEnv({
        WEBHOOKS_HOST: 'localhost',
        WEBHOOKS_PORT: '3102',
      }),
    ).toEqual({ INGRESS_HOST: 'localhost', INGRESS_PORT: 3102 });
  });

  it('assertLoopbackIngressHost rejects remote hosts', () => {
    expect(() => assertLoopbackIngressHost('192.168.1.1')).toThrow(/loopback/i);
    expect(() => assertLoopbackIngressHost('127.0.0.1')).not.toThrow();
  });
});
