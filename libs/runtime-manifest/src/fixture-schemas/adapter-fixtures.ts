import { z } from 'zod';

import {
  ADAPTER_FIXTURE_SCHEMA_PATHS,
  assertKnownFixtureSchemaPath,
} from './schema-paths.js';

const adapterFixtureDocumentBaseSchema = z
  .object({
    version: z.literal(1),
    schema: z.string().min(1),
    adapter: z.string().min(1),
    method: z.string().min(1),
    match: z.record(z.string(), z.unknown()),
    response: z.unknown(),
  })
  .strict();

export const piReviewAdapterFixtureResponseSchema = z
  .object({
    markdown: z.string().min(1),
  })
  .strict();

export const piReviewAdapterFixtureSchema =
  adapterFixtureDocumentBaseSchema.extend({
    schema: z.literal(ADAPTER_FIXTURE_SCHEMA_PATHS.PI_REVIEW),
    adapter: z.literal('pi'),
    method: z.literal('review'),
    response: piReviewAdapterFixtureResponseSchema,
  });

export type PiReviewAdapterFixture = z.infer<
  typeof piReviewAdapterFixtureSchema
>;

export type ParsedAdapterFixture = PiReviewAdapterFixture;

const adapterFixtureSchemaByPath = {
  [ADAPTER_FIXTURE_SCHEMA_PATHS.PI_REVIEW]: piReviewAdapterFixtureSchema,
} as const;

export function parseAdapterFixtureJson(json: unknown): ParsedAdapterFixture {
  const schemaPath = adapterFixtureDocumentBaseSchema.parse(json).schema;
  assertKnownFixtureSchemaPath(schemaPath);
  const parser =
    adapterFixtureSchemaByPath[
      schemaPath as keyof typeof adapterFixtureSchemaByPath
    ];
  if (parser === undefined) {
    throw new Error(
      `No adapter fixture parser registered for schema path: ${schemaPath}. Vendor adapter fixtures belong under adapters/* (e.g. adapter-gitlab). Registered: ${Object.keys(adapterFixtureSchemaByPath).join(', ')}`,
    );
  }
  return parser.parse(json) as ParsedAdapterFixture;
}

/** Returns true when every key in `match` equals the corresponding request field. */
export function adapterFixtureMatchSatisfies(
  match: Record<string, unknown>,
  request: Record<string, unknown>,
): boolean {
  for (const [key, expected] of Object.entries(match)) {
    if (request[key] !== expected) {
      return false;
    }
  }
  return true;
}

export function findAdapterFixtureMatch<T extends ParsedAdapterFixture>(
  rules: readonly T[],
  request: Record<string, unknown>,
): T | undefined {
  return rules.find((rule) =>
    adapterFixtureMatchSatisfies(rule.match, request),
  );
}
