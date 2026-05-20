import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deleteScenarioRun = vi.fn();
const installScenarioRun = vi.fn();
const runScenarioWebhookStep = vi.fn();

vi.mock('runtime-adapters', () => ({
  deleteScenarioRun,
  installScenarioRun,
  parseAdaptersBaseUrl: () => 'http://127.0.0.1:3104',
}));

vi.mock('../../src/scenario-ingress.js', () => ({
  resolveScenarioIngressBaseUrl: () => 'http://127.0.0.1:3102',
  runScenarioWebhookStep,
  runScenarioPollTick: vi.fn(),
}));

vi.mock('dev-cli-shared', () => ({
  createRootGraphObserver: vi.fn(),
  findLatestDevRunSnapshotRelativePath: vi.fn(),
  resolveDevOnceManifestPath: vi.fn(() => '/tmp/manifest.json'),
  resolveRootGraphWaitPollParams: () => ({ pollMs: 100, maxMs: 1000 }),
  retryDevFailedRunsOnRoot: vi.fn(),
  waitForLatestDevRunSnapshotRelativePath: vi.fn(),
}));

vi.mock('runtime-manifest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('runtime-manifest')>();
  return {
    ...actual,
    parseRuntimeManifestFile: () => ({
      version: 1,
      schema: actual.MANIFEST_SCHEMA_PATH,
      name: 'test',
      agents: [{ name: 'agent-reviewer' }],
      adapters: [{ source: 'synapse.adapters.gitlab.v1' }],
      scenarios: [
        'scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json',
      ],
    }),
  };
});

vi.mock('synapse-scenarios', () => ({
  resolveScenarioById: () => ({
    scenario: {
      id: 'review-pr/gitlab-synapse',
      ingress: {
        source: 'synapse.webhooks.prs.v1',
        fixtures: [
          { file: 'fixtures/agent-reviewer/gitlab-merge-request.json' },
        ],
      },
      adapters: [
        {
          source: 'synapse.adapters.gitlab.v1',
          method: 'fetchChanges',
          params: { projectId: 202, mergeRequestIid: 42 },
          returns: {
            data: { project_id: 202, merge_request_iid: 42, changes: [] },
          },
        },
      ],
      terminalEventTypes: ['pr.reviewed.v1'],
    },
    scenarioFilePath:
      'scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json',
  }),
  resolveScenarioIngressSource: () => ({
    kind: 'webhook',
    routeId: 'synapse.webhooks.prs.v1',
  }),
}));

vi.mock('runtime-store', () => ({
  createRuntimeStorePool: () => ({
    query: vi.fn().mockResolvedValue({ rowCount: 0 }),
    end: vi.fn().mockResolvedValue(undefined),
  }),
  selectEventById: vi.fn(),
}));

vi.mock('../../src/build-artifact.js', () => ({
  buildSynapseRunArtifact: vi.fn(),
}));

vi.mock('../../src/scenario-terminal.js', () => ({
  waitForScenarioTerminal: vi.fn(),
}));

describe('runDevOnce scenario run cleanup', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'synapse-dev-once-cleanup-'));
    vi.clearAllMocks();
    installScenarioRun.mockResolvedValue({
      scenarioRunId: 'scnrun_test_cleanup',
    });
    deleteScenarioRun.mockRejectedValue(new Error('adapters down'));
    runScenarioWebhookStep.mockRejectedValue(new Error('ingress failed'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes remote scenario run and clears local binding when scenario steps fail', async () => {
    const { runDevOnce } = await import('../../src/run-dev-once.js');
    await expect(
      runDevOnce({
        repoRoot,
        scenarioId: 'review-pr/gitlab-synapse',
        env: { SYNAPSE_DEV_SCENARIO_CONTEXT: '1' },
      }),
    ).rejects.toThrow(/ingress failed/);

    expect(deleteScenarioRun).toHaveBeenCalledWith(
      'http://127.0.0.1:3104',
      'scnrun_test_cleanup',
    );
    expect(
      existsSync(join(repoRoot, 'tmp/dev/active-scenario-run.json')),
    ).toBe(false);
  });

  it('clears local binding when remote delete succeeds', async () => {
    deleteScenarioRun.mockResolvedValue(undefined);
    runScenarioWebhookStep.mockRejectedValue(new Error('still failing'));

    const { runDevOnce } = await import('../../src/run-dev-once.js');
    await expect(
      runDevOnce({ repoRoot, scenarioId: 'review-pr/gitlab-synapse' }),
    ).rejects.toThrow();

    const runPath = join(repoRoot, 'tmp/dev/active-scenario-run.json');
    expect(existsSync(runPath)).toBe(false);
    if (existsSync(runPath)) {
      const raw = JSON.parse(readFileSync(runPath, 'utf8')) as {
        scenarioRunId: string;
      };
      expect(raw.scenarioRunId).not.toBe('scnrun_test_cleanup');
    }
  });
});
