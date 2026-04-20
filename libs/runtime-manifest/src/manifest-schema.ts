import { z } from 'zod';

import { MANIFEST_SCHEMA_PATH } from './fixture-schemas/schema-paths.js';
import { webhookRouteIdSchema } from './webhook-route-catalog.js';

export const runtimeManifestAgentFixturesSchema = z
  .object({
    webhook: z.array(z.string().min(1)),
    adapter: z.array(z.string().min(1)),
  })
  .strict();

export const runtimeManifestAgentSchema = z
  .object({
    name: z.string().min(1),
    handler: z.string().min(1),
    handles: z.array(z.string().min(1)).min(1),
    fixtures: runtimeManifestAgentFixturesSchema.optional(),
  })
  .strict();

export const runtimeManifestWebhooksSchema = z
  .object({
    routes: z.array(webhookRouteIdSchema).min(1),
  })
  .strict();

export const runtimeManifestSchema = z
  .object({
    version: z.literal(1),
    schema: z.literal(MANIFEST_SCHEMA_PATH),
    name: z.string().min(1),
    description: z.string().optional(),
    agents: z.array(runtimeManifestAgentSchema).min(1),
    webhooks: runtimeManifestWebhooksSchema.optional(),
  })
  .strict();

export type RuntimeManifest = z.infer<typeof runtimeManifestSchema>;
export type RuntimeManifestAgent = z.infer<typeof runtimeManifestAgentSchema>;
export type RuntimeManifestAgentFixtures = z.infer<
  typeof runtimeManifestAgentFixturesSchema
>;
