import type { ResolvedScenarioAdapterFixture } from 'runtime-adapters';
import type { Scenario, ScenarioAdapter } from 'runtime-manifest';
import { resolveFixtureValueJson } from 'synapse-scenarios/runtime';

export function resolveScenarioAdaptersForInstall(
  repoRoot: string,
  adapters: readonly ScenarioAdapter[],
): ResolvedScenarioAdapterFixture[] {
  return adapters.map((entry) => ({
    source: entry.source,
    method: entry.method,
    params: entry.params,
    returns: resolveFixtureValueJson(repoRoot, entry.returns),
  }));
}

export function scenarioAdapterSources(scenario: Scenario): string[] {
  const adapters = scenario.adapters ?? [];
  return [...new Set(adapters.map((entry) => entry.source))];
}
