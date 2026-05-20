import { AsyncLocalStorage } from 'node:async_hooks';

import type { ScenarioFixtureContext } from 'runtime-manifest';
import { SCENARIO_CONTEXT_ID_HEADER } from 'runtime-manifest';
import {
  createScenarioAdapterConsumptionState,
  type ScenarioAdapterConsumptionState,
} from './scenario-adapter-match.js';
import { consumeScenarioContext } from './scenario-context-store.js';

const scenarioContextStorage = new AsyncLocalStorage<
  ScenarioAdapterConsumptionState | undefined
>();

export function runWithScenarioFixtureContext<T>(
  context: ScenarioFixtureContext | undefined,
  fn: () => T,
): T {
  const state =
    context === undefined
      ? undefined
      : createScenarioAdapterConsumptionState(context);
  return scenarioContextStorage.run(state, fn);
}

export function getRequestScenarioAdapterState():
  | ScenarioAdapterConsumptionState
  | undefined {
  return scenarioContextStorage.getStore();
}

export function getRequestScenarioFixtureContext():
  | ScenarioFixtureContext
  | undefined {
  const state = scenarioContextStorage.getStore();
  if (state === undefined) {
    return undefined;
  }
  return { scenarioId: state.scenarioId, adapters: [...state.adapters] };
}

export function resolveWebhookScenarioContextFromHeader(
  contextId: string | undefined,
): ScenarioFixtureContext | undefined {
  if (contextId === undefined || contextId.trim() === '') {
    return undefined;
  }
  return consumeScenarioContext(contextId.trim());
}

export function resolveIngressRunSnapshotScenarioId(fallback: string): string {
  return getRequestScenarioFixtureContext()?.scenarioId ?? fallback;
}

export function scenarioContextIdFromHeaders(
  headers: Headers | Record<string, string | undefined>,
): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(SCENARIO_CONTEXT_ID_HEADER) ?? undefined;
  }
  const direct = headers[SCENARIO_CONTEXT_ID_HEADER];
  if (direct !== undefined) {
    return direct;
  }
  const lower = headers[SCENARIO_CONTEXT_ID_HEADER.toLowerCase()];
  return lower;
}
