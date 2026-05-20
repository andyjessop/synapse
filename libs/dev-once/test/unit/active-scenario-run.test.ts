import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  clearStaleActiveScenarioRun,
  writeActiveScenarioRun,
} from '../../src/active-scenario-run.js';

describe('clearStaleActiveScenarioRun', () => {
  let repoRoot: string;

  afterEach(() => {
    clearStaleActiveScenarioRun(repoRoot);
  });

  it('clears leftover run file so a new run can start', () => {
    repoRoot = mkdtempSync(join(tmpdir(), 'synapse-stale-scenario-run-'));
    writeActiveScenarioRun(repoRoot, {
      scenarioRunId: 'scnrun_stale',
      scenarioId: 'review-pr/gitlab-synapse',
    });

    const { clearedActive } = clearStaleActiveScenarioRun(repoRoot);
    expect(clearedActive?.scenarioRunId).toBe('scnrun_stale');
    expect(
      existsSync(join(repoRoot, 'tmp/dev/active-scenario-run.json')),
    ).toBe(false);
  });
});
