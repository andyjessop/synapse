import { assertRepoRelativePath } from './repo-relative-path.js';
import type { FixtureValue, Scenario } from './scenario-schema.js';

export function assertScenarioFilePath(path: string): void {
  assertRepoRelativePath(path);
  if (path.startsWith('libs/runtime-manifest/test/fixtures/scenarios/')) {
    return;
  }
  if (!path.startsWith('scenarios/')) {
    throw new Error(`Scenario file path must start with scenarios/: ${path}`);
  }
  if (!path.endsWith('.scenarios.json')) {
    throw new Error(
      `Scenario file path must end with .scenarios.json: ${path}`,
    );
  }
}

export function assertFixturePayloadPath(path: string): void {
  assertRepoRelativePath(path);
  if (!path.startsWith('fixtures/')) {
    throw new Error(`Fixture file path must start with fixtures/: ${path}`);
  }
}

export function assertScenarioFixtureValuePaths(
  scenario: Scenario,
  value: FixtureValue,
): void {
  if ('file' in value && value.file !== undefined) {
    assertFixturePayloadPath(value.file);
  }
}

export function assertScenarioLayoutPaths(scenario: Scenario): void {
  for (const fixture of scenario.ingress.fixtures) {
    assertScenarioFixtureValuePaths(scenario, fixture);
  }
  for (const adapter of scenario.adapters ?? []) {
    assertScenarioFixtureValuePaths(scenario, adapter.returns);
  }
}
