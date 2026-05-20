import { paramsStructurallyEqual } from './stable-json.js';
import type { ResolvedScenarioAdapterFixture } from './types.js';

export type ScenarioAdapterQueue = {
  scenarioRunId: string;
  scenarioId: string;
  dequeue(input: {
    source: string;
    method: string;
    params?: Record<string, unknown>;
  }): unknown;
};

function adapterMatchKey(
  source: string,
  method: string,
  params: Record<string, unknown>,
): string {
  return `${source}\0${method}\0${JSON.stringify(params)}`;
}

function normalizeParams(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return params ?? {};
}

export function createScenarioAdapterQueue(input: {
  scenarioRunId: string;
  scenarioId: string;
  fixtures: readonly ResolvedScenarioAdapterFixture[];
}): ScenarioAdapterQueue {
  const nextIndexByKey = new Map<string, number>();

  return {
    scenarioRunId: input.scenarioRunId,
    scenarioId: input.scenarioId,
    dequeue(dequeueInput) {
      const parsedParams = normalizeParams(dequeueInput.params);
      const matches = input.fixtures.filter(
        (entry) =>
          entry.source === dequeueInput.source &&
          entry.method === dequeueInput.method &&
          paramsStructurallyEqual(entry.params, parsedParams),
      );

      if (matches.length === 0) {
        throw new ScenarioAdapterQueueError(
          'adapter_fixture_not_found',
          `No scenario fixture matched ${dequeueInput.source}.${dequeueInput.method} with params ${JSON.stringify(parsedParams)}`,
        );
      }

      const key = adapterMatchKey(
        dequeueInput.source,
        dequeueInput.method,
        parsedParams,
      );
      const offset = nextIndexByKey.get(key) ?? 0;
      if (offset >= matches.length) {
        throw new ScenarioAdapterQueueError(
          'adapter_fixture_exhausted',
          `Scenario adapter fixtures exhausted for ${dequeueInput.source}.${dequeueInput.method}`,
        );
      }
      nextIndexByKey.set(key, offset + 1);
      return matches[offset]!.returns;
    },
  };
}

export class ScenarioAdapterQueueError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ScenarioAdapterQueueError';
    this.code = code;
  }
}
