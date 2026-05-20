import { z } from 'zod';

export const adaptersEnvSchema = z
  .object({
    ADAPTERS_HOST: z.string().min(1).optional(),
    ADAPTERS_PORT: z.coerce.number().int().positive().optional(),
    SYNAPSE_RUNTIME_MANIFEST: z.string().min(1).optional(),
    SYNAPSE_DEV_SCENARIO_CONTEXT: z.string().optional(),
    GITLAB_TOKEN: z.string().optional(),
    GITLAB_BASE_URL: z.string().optional(),
  })
  .passthrough();

export type AdaptersEnv = z.infer<typeof adaptersEnvSchema> & {
  ADAPTERS_HOST: string;
  ADAPTERS_PORT: number;
};

export function parseAdaptersEnv(
  env: Record<string, string | undefined> = process.env,
): AdaptersEnv {
  const parsed = adaptersEnvSchema.parse(env);
  return {
    ...parsed,
    ADAPTERS_HOST: parsed.ADAPTERS_HOST?.trim() || '127.0.0.1',
    ADAPTERS_PORT: parsed.ADAPTERS_PORT ?? 3104,
  };
}

export function isDevScenarioContextEnabled(
  env: Record<string, string | undefined>,
): boolean {
  const raw = env.SYNAPSE_DEV_SCENARIO_CONTEXT?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}
