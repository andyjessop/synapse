import { z } from 'zod';
import { MANIFEST_SCHEMA_PATH } from './fixture-schemas/schema-paths.js';
import { pollSourceIdSchema } from './poll-source-catalog.js';
import { webhookRouteIdSchema } from './webhook-route-catalog.js';

export const webhookMountEntrySchema = z
  .object({
    source: webhookRouteIdSchema,
  })
  .strict();

export const pollSourceManifestEntrySchema = z
  .object({
    source: pollSourceIdSchema,
    intervalMs: z.number().int().positive().optional(),
    lockTtlMs: z.number().int().positive().optional(),
    enabled: z.boolean().optional(),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const runtimeManifestAgentSchema = z
  .object({
    name: z.string().min(1),
  })
  .strict();

export const adapterMountEntrySchema = z
  .object({
    /** Adapter source id; must be registered in `apps/adapters` at invoke time. */
    source: z.string().min(1),
  })
  .strict();

export const runtimeManifestSchema = z
  .object({
    version: z.literal(1),
    schema: z.literal(MANIFEST_SCHEMA_PATH),
    name: z.string().min(1),
    description: z.string().optional(),
    agents: z.array(runtimeManifestAgentSchema).min(1),
    webhooks: z.array(webhookMountEntrySchema).optional(),
    pollers: z.array(pollSourceManifestEntrySchema).optional(),
    adapters: z.array(adapterMountEntrySchema).optional(),
  })
  .strict();

export type RuntimeManifest = z.infer<typeof runtimeManifestSchema>;
export type RuntimeManifestAgent = z.infer<typeof runtimeManifestAgentSchema>;
export type WebhookMountEntry = z.infer<typeof webhookMountEntrySchema>;
export type PollSourceManifestEntry = z.infer<
  typeof pollSourceManifestEntrySchema
>;
export type AdapterMountEntry = z.infer<typeof adapterMountEntrySchema>;
