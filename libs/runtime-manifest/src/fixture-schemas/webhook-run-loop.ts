import { z } from 'zod';

import {
  assertKnownFixtureSchemaPath,
  WEBHOOK_FIXTURE_SCHEMA_PATHS,
} from './schema-paths.js';

export const synapseWebhookFixtureIngressSchema = z
  .object({
    kind: z.literal('webhook'),
    method: z.literal('POST'),
    path: z.string().min(1),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.union([
      z.unknown(),
      z.object({ file: z.string().min(1) }).strict(),
    ]),
  })
  .strict();

export const synapseWebhookFixtureExpectSchema = z
  .object({
    rootEventType: z.string().min(1).optional(),
    eventTypes: z.array(z.string().min(1)).optional(),
    terminalEventTypes: z.array(z.string().min(1)).optional(),
    agentRuns: z
      .array(
        z
          .object({
            agent: z.string().min(1),
            reactorName: z.string().min(1).optional(),
            status: z.enum(['succeeded', 'failed']).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const synapseWebhookRunLoopFixtureSchema = z
  .object({
    version: z.literal(1),
    schema: z.literal(WEBHOOK_FIXTURE_SCHEMA_PATHS.RUN_LOOP),
    id: z.string().min(1),
    title: z.string().min(1),
    agent: z.string().min(1),
    description: z.string().optional(),
    tags: z.array(z.string().min(1)).optional(),
    ingress: synapseWebhookFixtureIngressSchema,
    expect: synapseWebhookFixtureExpectSchema.optional(),
  })
  .strict();

export type SynapseWebhookFixtureIngress = z.infer<
  typeof synapseWebhookFixtureIngressSchema
>;

export type SynapseWebhookRunLoopFixture = z.infer<
  typeof synapseWebhookRunLoopFixtureSchema
>;

export function parseWebhookRunLoopFixtureJson(
  json: unknown,
): SynapseWebhookRunLoopFixture {
  const schemaPath =
    typeof json === 'object' &&
    json !== null &&
    'schema' in json &&
    typeof (json as { schema: unknown }).schema === 'string'
      ? (json as { schema: string }).schema
      : undefined;
  if (schemaPath !== undefined) {
    assertKnownFixtureSchemaPath(schemaPath);
  }
  return synapseWebhookRunLoopFixtureSchema.parse(json);
}
