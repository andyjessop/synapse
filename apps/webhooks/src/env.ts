import { parseRuntimeConfig } from 'runtime-config';
import { z } from 'zod';

export const webhooksEnvSchema = z
  .object({
    WEBHOOKS_HOST: z.string().min(1).default('127.0.0.1'),
    WEBHOOKS_PORT: z.coerce.number().int().positive().default(3102),
    SYNAPSE_RUNTIME_MANIFEST: z.string().min(1).optional(),
  })
  .passthrough();

export type WebhooksEnv = z.infer<typeof webhooksEnvSchema> & {
  databaseUrl: string;
  redisUrl: string;
};

export function parseWebhooksEnv(
  env: Record<string, string | undefined> = process.env,
): WebhooksEnv {
  const runtime = parseRuntimeConfig(env);
  const parsed = webhooksEnvSchema.parse(env);
  return {
    ...parsed,
    databaseUrl: runtime.databaseUrl,
    redisUrl: runtime.redisUrl,
  };
}
