import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repoRoot = join(
  fileURLToPath(new URL('../../..', import.meta.url)),
  '..',
);
const workerSrc = join(repoRoot, 'apps/worker/src');

const loadValidatedManifestRegistry = vi.hoisted(() =>
  vi.fn(async () => ({
    manifest: {
      name: 'application-default',
      manifestPath: join(repoRoot, 'manifests/application.json'),
      version: 1 as const,
      agents: [],
    },
    registry: { agents: [] },
    handlers: new Map(),
  })),
);

vi.mock('runtime-manifest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('runtime-manifest')>();
  return {
    ...actual,
    loadValidatedManifestRegistry,
    formatManifestStartupLine: vi.fn(() => 'synapse manifest: test'),
  };
});

vi.mock('runtime-worker', () => ({
  wrapManifestRuntimeRegistry: vi.fn((registry) => registry),
}));

const { loadWorkerManifestRegistry, manifestPlanningLogFields } = await import(
  '../../src/manifest-registry.js'
);

describe('worker manifest registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads manifest registry without agent-specific adapter wiring', async () => {
    const env = {
      SYNAPSE_RUNTIME_MANIFEST: join(repoRoot, 'manifests/application.json'),
    };
    const loaded = await loadWorkerManifestRegistry(env, import.meta.url);
    expect(loadValidatedManifestRegistry).toHaveBeenCalledWith(
      expect.objectContaining({
        repoRoot,
        manifestPath: env.SYNAPSE_RUNTIME_MANIFEST,
        env,
      }),
    );
    expect(loaded.manifest.name).toBe('application-default');
  });

  it('formats manifest planning log fields', () => {
    expect(
      manifestPlanningLogFields(
        {
          name: 'application-default',
          manifestPath: join(repoRoot, 'manifests/application.json'),
          version: 1,
          agents: [],
        },
        'agent-reviewer',
        'pr.received.v1',
      ),
    ).toEqual({
      manifest_name: 'application-default',
      manifest_path: join(repoRoot, 'manifests/application.json'),
      agent_name: 'agent-reviewer',
      event_type: 'pr.received.v1',
    });
  });

  it('does not reference dev-adapters or agent-reviewer Pi injection in source', () => {
    const manifestRegistry = readFileSync(
      join(workerSrc, 'manifest-registry.ts'),
      'utf8',
    );
    const main = readFileSync(join(workerSrc, 'main.ts'), 'utf8');
    for (const source of [manifestRegistry, main]) {
      expect(source).not.toContain('dev-adapters');
      expect(source).not.toContain('setReviewPrPiClient');
      expect(source).not.toContain('SYNAPSE_DEV_ADAPTERS_JSON');
      expect(source).not.toContain('pi-harness');
      expect(source).not.toContain('adapter-gitlab');
    }
  });
});
