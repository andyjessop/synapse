import { z } from 'zod';

import { pollSourceIdSchema } from '../poll-source-catalog.js';
import {
  assertKnownFixtureSchemaPath,
  POLL_FIXTURE_SCHEMA_PATHS,
} from './schema-paths.js';
import { synapseWebhookFixtureExpectSchema } from './webhook-run-loop.js';

export const synapsePollFixtureIngressSchema = z
  .object({
    kind: z.literal('poll'),
    source: pollSourceIdSchema,
    mode: z.enum(['inject', 'tick']),
    /** Opaque at schema boundary; `readPollInjectCandidates` resolves inline JSON or `{ file }`. */
    body: z.unknown().optional(),
  })
  .strict();

export const synapsePollRunLoopFixtureSchema = z
  .object({
    version: z.literal(1),
    schema: z.literal(POLL_FIXTURE_SCHEMA_PATHS.RUN_LOOP),
    id: z.string().min(1),
    title: z.string().min(1),
    agent: z.string().min(1),
    description: z.string().optional(),
    tags: z.array(z.string().min(1)).optional(),
    ingress: synapsePollFixtureIngressSchema,
    expect: synapseWebhookFixtureExpectSchema.optional(),
  })
  .strict();

export type SynapsePollFixtureIngress = z.infer<
  typeof synapsePollFixtureIngressSchema
>;

export type SynapsePollRunLoopFixture = z.infer<
  typeof synapsePollRunLoopFixtureSchema
>;

export function parsePollRunLoopFixtureJson(
  json: unknown,
): SynapsePollRunLoopFixture {
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
  return synapsePollRunLoopFixtureSchema.parse(json);
}
