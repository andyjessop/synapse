import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createDevRuntimePlan,
  devSessionFilePath,
  formatDevStartupBanner,
  getDevRuntimeProcesses,
  isDevCriticalProcess,
  parseDevCliArgs,
} from './dev';

const metaUrl = new URL('./dev.ts', import.meta.url);
const repoRoot = join(fileURLToPath(metaUrl), '..');

describe('parseDevCliArgs', () => {
  it('returns empty options by default', () => {
    expect(parseDevCliArgs([])).toEqual({});
  });

  it('parses --manifest', () => {
    expect(
      parseDevCliArgs(['--manifest', 'manifests/examples/echo.json']),
    ).toEqual({
      manifestPath: 'manifests/examples/echo.json',
    });
  });

  it('rejects unknown CLI flags', () => {
    expect(() => parseDevCliArgs(['--apps-only'])).toThrow(/Unknown dev flag/);
  });
});

describe('getDevRuntimeProcesses', () => {
  it('starts worker and webhooks', () => {
    const processes = getDevRuntimeProcesses();
    expect(processes.map((process) => process.name)).toEqual([
      'worker',
      'webhooks',
    ]);
  });
});

describe('createDevRuntimePlan', () => {
  it('points compose at the local stack file and sets manifest env', () => {
    const plan = createDevRuntimePlan({}, metaUrl);
    expect(plan.composeFile).toMatch(/local\/docker-compose\.yml$/);
    expect(plan.processes).toHaveLength(2);
    expect(plan.env.SYNAPSE_RUNTIME_MANIFEST).toContain(
      'manifests/application.json',
    );
    expect(plan.env.SYNAPSE_RUNTIME_MANIFEST).toBeDefined();
    expect(plan.env.SYNAPSE_DEV_ADAPTERS_JSON).toBeUndefined();
    expect(existsSync(devSessionFilePath(plan.repoRoot))).toBe(true);
    const session = JSON.parse(
      readFileSync(devSessionFilePath(plan.repoRoot), 'utf8'),
    ) as { manifest_name: string };
    expect(session.manifest_name).toBe('application-default');
  });

  it('records example webhook routes from echo manifest in dev session', () => {
    const plan = createDevRuntimePlan(
      {},
      metaUrl,
      { manifestPath: 'manifests/examples/echo.json' },
    );
    expect(plan.env.SYNAPSE_DEV_ADAPTERS_JSON).toBeUndefined();
    const session = JSON.parse(
      readFileSync(devSessionFilePath(plan.repoRoot), 'utf8'),
    ) as { webhooks: { routes: string[] } };
    expect(session.webhooks.routes).toEqual([
      'synapse.webhooks.example-echo-ping.v1',
    ]);
  });
});

describe('isDevCriticalProcess', () => {
  it('treats worker as critical', () => {
    expect(isDevCriticalProcess('worker')).toBe(true);
    expect(isDevCriticalProcess('webhooks')).toBe(false);
  });
});

describe('formatDevStartupBanner', () => {
  it('mentions manifest-based echo workflow', () => {
    const banner = formatDevStartupBanner(createDevRuntimePlan({}, metaUrl));
    expect(banner).toContain('127.0.0.1:25432');
    expect(banner).toContain('3102');
    expect(banner).toContain('manifests/examples/echo.json');
  });
});
