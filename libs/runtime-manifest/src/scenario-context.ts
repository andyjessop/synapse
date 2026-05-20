import { z } from 'zod';

import { scenarioAdapterSchema } from './scenario-schema.js';

export const scenarioFixtureContextSchema = z
  .object({
    scenarioId: z.string().min(1),
    /** Adapter mocks are installed on apps/adapters; poll/webhook paths keep ingress-only context here. */
    adapters: z.array(scenarioAdapterSchema).optional(),
    /** Resolved JSON for the current poll tick; omitted for webhook-only context installs. */
    ingressFixture: z.unknown().optional(),
  })
  .strict();

export type ScenarioFixtureContext = z.infer<
  typeof scenarioFixtureContextSchema
>;

export const pollTickRequestSchema = z
  .object({
    scenarioFixtureContext: scenarioFixtureContextSchema.optional(),
  })
  .strict();

export type PollTickRequest = z.infer<typeof pollTickRequestSchema>;

export const installScenarioContextRequestSchema = z
  .object({
    scenarioFixtureContext: scenarioFixtureContextSchema,
  })
  .strict();

export type InstallScenarioContextRequest = z.infer<
  typeof installScenarioContextRequestSchema
>;

export const installScenarioContextResponseSchema = z
  .object({
    contextId: z.string().min(1),
  })
  .strict();

export type InstallScenarioContextResponse = z.infer<
  typeof installScenarioContextResponseSchema
>;

/** Header for webhook requests referencing a prior context install. */
export const SCENARIO_CONTEXT_ID_HEADER =
  'X-Synapse-Scenario-Context-Id' as const;
