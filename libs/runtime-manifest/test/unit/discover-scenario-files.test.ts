import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  discoverScenarioFilePaths,
  listScenarioPathsForManifest,
  parseRuntimeManifestFile,
} from '../../src/index.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('discoverScenarioFilePaths', () => {
  it('finds repo scenarios and test fixture scenario files', () => {
    const paths = discoverScenarioFilePaths(repoRoot);
    expect(paths).toContain('scenarios/echo.scenarios.json');
    expect(paths).toContain(
      'scenarios/agent-reviewer/review-pr-gitlab-synapse.scenarios.json',
    );
    expect(paths).toContain(
      'libs/runtime-manifest/test/fixtures/scenarios/dup-a.scenarios.json',
    );
  });
});

describe('listScenarioPathsForManifest', () => {
  it('returns files with scenarios bound to manifest.name', () => {
    const manifest = parseRuntimeManifestFile(
      join(repoRoot, 'manifests/examples/echo-poll.json'),
    );
    const paths = listScenarioPathsForManifest(repoRoot, manifest);
    expect(paths).toContain('scenarios/echo.scenarios.json');
    expect(paths).toContain('scenarios/echo-poll.scenarios.json');
  });

  it('omits files with no scenarios for the manifest', () => {
    const manifest = parseRuntimeManifestFile(
      join(repoRoot, 'manifests/examples/echo.json'),
    );
    const paths = listScenarioPathsForManifest(repoRoot, manifest);
    expect(paths).toContain('scenarios/echo.scenarios.json');
    expect(paths).not.toContain('scenarios/echo-poll.scenarios.json');
  });
});
