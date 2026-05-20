/**
 * Dev-only in-memory scenario run store.
 * Not production persistence. Production invokes must not depend on this.
 */
import { randomUUID } from 'node:crypto';

import type { ResolvedScenarioAdapterFixture } from 'runtime-adapters';
import { createScenarioAdapterQueue } from 'runtime-adapters';

export type ScenarioRunRecord = {
  scenarioRunId: string;
  scenarioId: string;
  queue: ReturnType<typeof createScenarioAdapterQueue>;
};

const runs = new Map<string, ScenarioRunRecord>();

export function createScenarioRunId(): string {
  return `scnrun_${randomUUID()}`;
}

export function installScenarioRun(input: {
  scenarioId: string;
  adapters: readonly ResolvedScenarioAdapterFixture[];
}): string {
  const scenarioRunId = createScenarioRunId();
  runs.set(scenarioRunId, {
    scenarioRunId,
    scenarioId: input.scenarioId,
    queue: createScenarioAdapterQueue({
      scenarioRunId,
      scenarioId: input.scenarioId,
      fixtures: input.adapters,
    }),
  });
  return scenarioRunId;
}

export function getScenarioRun(
  scenarioRunId: string,
): ScenarioRunRecord | undefined {
  return runs.get(scenarioRunId);
}

export function deleteScenarioRun(scenarioRunId: string): boolean {
  return runs.delete(scenarioRunId);
}

export function clearScenarioRunsForTest(): void {
  runs.clear();
}
