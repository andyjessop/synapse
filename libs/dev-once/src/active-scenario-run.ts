import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

const DEV_TMP_DIR = join('tmp', 'dev');
const RUN_FILE = 'active-scenario-run.json';

const activeScenarioRunSchema = z
  .object({
    scenarioRunId: z.string().min(1),
    scenarioId: z.string().min(1),
    startedAt: z.string().min(1),
  })
  .strict();

export type ActiveScenarioRun = z.infer<typeof activeScenarioRunSchema>;

function devTmpDir(repoRoot: string): string {
  return join(repoRoot, DEV_TMP_DIR);
}

function runFilePath(repoRoot: string): string {
  return join(devTmpDir(repoRoot), RUN_FILE);
}

function ensureDevTmpDir(repoRoot: string): void {
  const dir = devTmpDir(repoRoot);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function writeActiveScenarioRun(
  repoRoot: string,
  input: { scenarioRunId: string; scenarioId: string },
): ActiveScenarioRun {
  ensureDevTmpDir(repoRoot);
  const record: ActiveScenarioRun = {
    scenarioRunId: input.scenarioRunId,
    scenarioId: input.scenarioId,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(
    runFilePath(repoRoot),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8',
  );
  return record;
}

export function clearActiveScenarioRun(repoRoot: string): void {
  const runPath = runFilePath(repoRoot);
  if (existsSync(runPath)) {
    unlinkSync(runPath);
  }
}

/**
 * Read and remove a leftover run file (e.g. before `dev:once:clean`).
 */
export function clearStaleActiveScenarioRun(repoRoot: string): {
  clearedActive?: ActiveScenarioRun;
} {
  let clearedActive: ActiveScenarioRun | undefined;
  const runPath = runFilePath(repoRoot);
  if (existsSync(runPath)) {
    try {
      clearedActive = activeScenarioRunSchema.parse(
        JSON.parse(readFileSync(runPath, 'utf8')) as unknown,
      );
    } catch {
      // ignore corrupt run file; still delete below
    }
    clearActiveScenarioRun(repoRoot);
  }
  return { clearedActive };
}

export function readActiveScenarioRun(
  repoRoot: string,
): ActiveScenarioRun | undefined {
  const runPath = runFilePath(repoRoot);
  if (!existsSync(runPath)) {
    return undefined;
  }
  return activeScenarioRunSchema.parse(
    JSON.parse(readFileSync(runPath, 'utf8')) as unknown,
  );
}
