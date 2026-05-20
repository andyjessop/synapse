import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as runtimeManifest from 'runtime-manifest';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveIngressAppConfig,
  resolveWebhookRouteIdsForApp,
} from '../../src/resolve-ingress-app-config.js';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const echoManifest = join(repoRoot, 'manifests/examples/echo.json');

describe('resolveIngressAppConfig', () => {
  it('parses manifest once when manifestPath is set', () => {
    const parseSpy = vi.spyOn(runtimeManifest, 'parseRuntimeManifestFile');
    resolveIngressAppConfig({
      pool: {} as never,
      manifestPath: echoManifest,
    });
    expect(parseSpy).toHaveBeenCalledTimes(1);
    parseSpy.mockRestore();
  });

  it('uses explicit webhookRouteIds without manifest', () => {
    expect(
      resolveIngressAppConfig({
        pool: {} as never,
        webhookRouteIds: ['synapse.webhooks.example-echo.v1'],
      }).webhookRouteIds,
    ).toEqual(['synapse.webhooks.example-echo.v1']);
  });
});

describe('resolveWebhookRouteIdsForApp', () => {
  it('returns empty when explicit ids are unset', () => {
    expect(resolveWebhookRouteIdsForApp({})).toEqual([]);
  });

  it('copies explicit webhook route ids only', () => {
    expect(
      resolveWebhookRouteIdsForApp({
        webhookRouteIds: ['synapse.webhooks.example-echo-ping.v1'],
      }),
    ).toEqual(['synapse.webhooks.example-echo-ping.v1']);
  });
});
