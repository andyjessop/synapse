import type { Scenario, ScenarioFixtureContext } from 'runtime-manifest';

export function buildScenarioFixtureContextForWebhook(
  scenario: Scenario,
): ScenarioFixtureContext {
  return {
    scenarioId: scenario.id,
  };
}

export function buildScenarioFixtureContextForPollTick(
  scenario: Scenario,
  ingressFixture: unknown,
): ScenarioFixtureContext {
  return {
    scenarioId: scenario.id,
    ingressFixture,
  };
}
