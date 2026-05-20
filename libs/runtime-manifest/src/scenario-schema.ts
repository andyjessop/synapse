import { z } from 'zod';

import { SCENARIO_RUN_LOOP_SCHEMA_PATH } from './scenario-schema-paths.js';

export const fixtureValueSchema = z.union([
  z.object({ file: z.string().min(1) }).strict(),
  z.object({ data: z.unknown() }).strict(),
]);

export type FixtureValue = z.infer<typeof fixtureValueSchema>;

export const scenarioAdapterSchema = z
  .object({
    /** Adapter source id; validated against `apps/adapters` registry when installed or invoked. */
    source: z.string().min(1),
    method: z.string().min(1),
    params: z.record(z.string(), z.unknown()).optional(),
    returns: fixtureValueSchema,
  })
  .strict();

export type ScenarioAdapter = z.infer<typeof scenarioAdapterSchema>;

export const scenarioAdapterFixtureSchema = scenarioAdapterSchema;

/** @deprecated Use ScenarioAdapter */
export type ScenarioAdapterFixture = ScenarioAdapter;

export const scenarioIngressSchema = z
  .object({
    source: z.string().min(1),
    fixtures: z.array(fixtureValueSchema).min(1),
  })
  .strict();

export const scenarioSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    /** Runtime manifest `name` values this scenario may run under (`dev:once --list`). */
    manifests: z.array(z.string().min(1)).min(1),
    ingress: scenarioIngressSchema,
    adapters: z.array(scenarioAdapterSchema).optional(),
    terminalEventTypes: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();

export type Scenario = z.infer<typeof scenarioSchema>;

export const scenarioFileSchema = z
  .object({
    version: z.literal(1),
    schema: z.literal(SCENARIO_RUN_LOOP_SCHEMA_PATH),
    scenarios: z.array(scenarioSchema).min(1),
  })
  .strict();

export type ScenarioFile = z.infer<typeof scenarioFileSchema>;

export function parseScenarioFileJson(json: unknown): ScenarioFile {
  return scenarioFileSchema.parse(json);
}
