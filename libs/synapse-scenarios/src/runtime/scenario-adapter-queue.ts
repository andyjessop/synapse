import type { ScenarioAdapter, ScenarioFixtureContext } from 'runtime-manifest';

import { paramsStructurallyEqual } from './params-structurally-equal.js';
import { resolveFixtureValueJson } from './resolve-fixture-value-json.js';

export type ScenarioAdapterQueue = {
  scenarioId: string;
  dequeue(input: {
    source: string;
    method: string;
    params?: Record<string, unknown>;
    repoRoot: string;
  }): unknown;
};

function adapterMatchKey(
  source: string,
  method: string,
  params: Record<string, unknown> | undefined,
): string {
  return `${source}\0${method}\0${JSON.stringify(params ?? null)}`;
}

export function createScenarioAdapterQueue(
  adapters: readonly ScenarioAdapter[],
  scenarioId: string,
): ScenarioAdapterQueue {
  const nextIndexByKey = new Map<string, number>();

  return {
    scenarioId,
    dequeue(input) {
      const matches = adapters.filter(
        (entry) =>
          entry.source === input.source &&
          entry.method === input.method &&
          paramsStructurallyEqual(entry.params, input.params),
      );

      if (matches.length === 0) {
        throw new Error(
          `No scenario adapter fixture for scenario ${scenarioId} (${input.source}.${input.method})`,
        );
      }

      const key = adapterMatchKey(input.source, input.method, input.params);
      const offset = nextIndexByKey.get(key) ?? 0;
      if (offset >= matches.length) {
        throw new Error(
          `Scenario adapter fixtures exhausted for ${scenarioId} (${input.source}.${input.method})`,
        );
      }
      nextIndexByKey.set(key, offset + 1);
      return resolveFixtureValueJson(input.repoRoot, matches[offset]!.returns);
    },
  };
}

export type ScenarioAdapterConsumptionState = {
  scenarioId: string;
  adapters: readonly ScenarioAdapter[];
  nextIndexByKey: Map<string, number>;
};

export function createScenarioAdapterConsumptionState(
  context: ScenarioFixtureContext,
): ScenarioAdapterConsumptionState {
  return {
    scenarioId: context.scenarioId,
    adapters: context.adapters ?? [],
    nextIndexByKey: new Map(),
  };
}

export function consumeScenarioAdapterFixture(
  state: ScenarioAdapterConsumptionState,
  input: {
    source: string;
    method: string;
    params?: Record<string, unknown>;
    repoRoot: string;
  },
): ScenarioAdapter {
  const matches = state.adapters.filter(
    (fixture) =>
      fixture.source === input.source &&
      fixture.method === input.method &&
      paramsStructurallyEqual(fixture.params, input.params),
  );

  if (matches.length === 0) {
    throw new Error(
      `No scenario adapter fixture for scenario ${state.scenarioId} (${input.source}.${input.method})`,
    );
  }

  const key = adapterMatchKey(input.source, input.method, input.params);
  const offset = state.nextIndexByKey.get(key) ?? 0;
  if (offset >= matches.length) {
    throw new Error(
      `Scenario adapter fixtures exhausted for ${state.scenarioId} (${input.source}.${input.method})`,
    );
  }
  state.nextIndexByKey.set(key, offset + 1);
  return matches[offset]!;
}
