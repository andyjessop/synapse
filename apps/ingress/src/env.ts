import { parseRuntimeConfig } from 'runtime-config';
import { z } from 'zod';

export const ingressEnvSchema = z
  .object({
    INGRESS_HOST: z.string().min(1).optional(),
    INGRESS_PORT: z.coerce.number().int().positive().optional(),
    WEBHOOKS_HOST: z.string().min(1).optional(),
    WEBHOOKS_PORT: z.coerce.number().int().positive().optional(),
    SYNAPSE_RUNTIME_MANIFEST: z.string().min(1).optional(),
  })
  .passthrough();

export type IngressEnv = z.infer<typeof ingressEnvSchema> & {
  INGRESS_HOST: string;
  INGRESS_PORT: number;
  databaseUrl: string;
  redisUrl: string;
};

export function parseIngressEnv(
  env: Record<string, string | undefined> = process.env,
): IngressEnv {
  const runtime = parseRuntimeConfig(env);
  const parsed = ingressEnvSchema.parse(env);
  const host =
    parsed.INGRESS_HOST?.trim() || parsed.WEBHOOKS_HOST?.trim() || '127.0.0.1';
  const port = parsed.INGRESS_PORT ?? parsed.WEBHOOKS_PORT ?? 3102;
  return {
    ...parsed,
    INGRESS_HOST: host,
    INGRESS_PORT: port,
    WEBHOOKS_HOST: host,
    WEBHOOKS_PORT: port,
    databaseUrl: runtime.databaseUrl,
    redisUrl: runtime.redisUrl,
  };
}

/** @deprecated Use {@link parseIngressEnv} */
export const webhooksEnvSchema = ingressEnvSchema;
/** @deprecated Use {@link IngressEnv} */
export type WebhooksEnv = IngressEnv;
/** @deprecated Use {@link parseIngressEnv} */
export const parseWebhooksEnv = parseIngressEnv;
