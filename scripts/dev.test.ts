import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createDevRuntimePlan,
  DEV_WORKER_DEBUG_PORT,
  devRuntimeNeedsIngress,
  devWorkerDebugPort,
  formatDevStartupBanner,
  getDevRuntimeProcesses,
  getDevWorkerStartCommand,
  isDevCriticalProcess,
  isDevWorkerDebugEnabled,
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

describe('getDevWorkerStartCommand', () => {
  it('uses nx when worker debug is off', () => {
    expect(getDevWorkerStartCommand({})).toEqual([
      'npx',
      'nx',
      'run',
      'worker:start',
    ]);
  });

  it('uses node inspect + tsx worker entry when debug is on', () => {
    expect(getDevWorkerStartCommand({ SYNAPSE_DEV_DEBUG_WORKER: '1' })).toEqual(
      [
        'node',
        `--inspect=${DEV_WORKER_DEBUG_PORT}`,
        '--import',
        'tsx',
        'apps/worker/src/main.ts',
      ],
    );
  });

  it('honors SYNAPSE_DEV_DEBUG_WORKER_PORT', () => {
    expect(
      getDevWorkerStartCommand({
        SYNAPSE_DEV_DEBUG_WORKER: 'true',
        SYNAPSE_DEV_DEBUG_WORKER_PORT: '9240',
      }),
    ).toEqual([
      'node',
      '--inspect=9240',
      '--import',
      'tsx',
      'apps/worker/src/main.ts',
    ]);
  });
});

describe('isDevWorkerDebugEnabled', () => {
  it('is false by default', () => {
    expect(isDevWorkerDebugEnabled({})).toBe(false);
  });

  it('accepts 1 and true', () => {
    expect(isDevWorkerDebugEnabled({ SYNAPSE_DEV_DEBUG_WORKER: '1' })).toBe(
      true,
    );
    expect(isDevWorkerDebugEnabled({ SYNAPSE_DEV_DEBUG_WORKER: 'true' })).toBe(
      true,
    );
  });
});

describe('devWorkerDebugPort', () => {
  it('defaults to the shared constant', () => {
    expect(devWorkerDebugPort({})).toBe(DEV_WORKER_DEBUG_PORT);
  });
});

describe('devRuntimeNeedsIngress', () => {
  it('is false with no webhook routes or poll sources', () => {
    expect(
      devRuntimeNeedsIngress({ webhookRouteIds: [], pollSources: [] }),
    ).toBe(false);
  });

  it('is true when webhook routes are listed', () => {
    expect(
      devRuntimeNeedsIngress({
        webhookRouteIds: ['synapse.webhooks.prs.v1'],
        pollSources: [],
      }),
    ).toBe(true);
  });

  it('is true when poll sources are listed', () => {
    expect(
      devRuntimeNeedsIngress({
        webhookRouteIds: [],
        pollSources: [{ id: 'synapse.poll.example-in-memory-heartbeat.v1' }],
      }),
    ).toBe(true);
  });
});

describe('getDevRuntimeProcesses', () => {
  it('starts adapters before worker when ingress is not needed', () => {
    const processes = getDevRuntimeProcesses({}, { needsIngress: false });
    expect(processes.map((process) => process.name)).toEqual([
      'adapters',
      'worker',
    ]);
  });

  it('starts adapters, worker, then ingress when ingress is needed', () => {
    const processes = getDevRuntimeProcesses({}, { needsIngress: true });
    expect(processes.map((process) => process.name)).toEqual([
      'adapters',
      'worker',
      'ingress',
    ]);
  });
});

describe('createDevRuntimePlan', () => {
  it('points compose at the local stack file and sets manifest env', () => {
    const plan = createDevRuntimePlan({}, metaUrl);
    expect(plan.composeFile).toMatch(/local\/docker-compose\.yml$/);
    expect(plan.needsIngress).toBe(true);
    expect(plan.processes.map((p) => p.name)).toEqual([
      'adapters',
      'worker',
      'ingress',
    ]);
    expect(plan.env.SYNAPSE_RUNTIME_MANIFEST).toContain(
      'manifests/application.json',
    );
    expect(plan.env.SYNAPSE_RUNTIME_MANIFEST).toBeDefined();
    expect(plan.env.SYNAPSE_DEV_SCENARIO_CONTEXT).toBe('1');
    expect(plan.env.ADAPTERS_BASE_URL).toBe('http://127.0.0.1:3104');
    expect(plan.env.SYNAPSE_DEV_ADAPTERS_JSON).toBeUndefined();
    expect(existsSync(join(plan.repoRoot, 'tmp/dev/runs'))).toBe(true);
  });

  it('enables ingress for echo manifest webhooks', () => {
    const plan = createDevRuntimePlan({}, metaUrl, {
      manifestPath: 'manifests/examples/echo.json',
    });
    expect(plan.needsIngress).toBe(true);
    expect(plan.env.SYNAPSE_RUNTIME_MANIFEST).toContain(
      'manifests/examples/echo.json',
    );
  });

  it('omits ingress for worker-only manifests', () => {
    const plan = createDevRuntimePlan({}, metaUrl, {
      manifestPath: 'manifests/debug/worker-only.json',
    });
    expect(plan.needsIngress).toBe(false);
    expect(plan.processes.map((p) => p.name)).toEqual(['adapters', 'worker']);
  });
});

describe('isDevCriticalProcess', () => {
  it('treats adapters and worker as critical', () => {
    expect(isDevCriticalProcess('adapters')).toBe(true);
    expect(isDevCriticalProcess('worker')).toBe(true);
    expect(isDevCriticalProcess('ingress')).toBe(false);
  });
});

describe('formatDevStartupBanner', () => {
  it('mentions manifest-based echo workflow', () => {
    const banner = formatDevStartupBanner(createDevRuntimePlan({}, metaUrl));
    expect(banner).toContain('127.0.0.1:25432');
    expect(banner).toContain('3102');
    expect(banner).toContain('manifests/examples/echo.json');
  });

  it('omits ingress URL when worker-only manifest', () => {
    const plan = createDevRuntimePlan({}, metaUrl, {
      manifestPath: 'manifests/debug/worker-only.json',
    });
    expect(formatDevStartupBanner(plan)).not.toContain('Ingress');
  });

  it('mentions worker inspector when debug env is set', () => {
    const plan = createDevRuntimePlan(
      { SYNAPSE_DEV_DEBUG_WORKER: '1' },
      metaUrl,
    );
    expect(formatDevStartupBanner(plan)).toContain(
      `127.0.0.1:${DEV_WORKER_DEBUG_PORT}`,
    );
  });
});
