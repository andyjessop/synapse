import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';

const optionalCredentialSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

/**
 * Minimal `.env`-style loader (no shell expansion).
 * When the file is missing, returns `baseEnv` unchanged (same reference).
 * When present, starts from a shallow copy of `baseEnv` and only sets keys
 * that are still `undefined` in that copy (real environment always wins over
 * the file). `baseEnv` is not mutated; pass the return value to config parsers.
 */
export function loadDotEnvLocal(
  path: string,
  baseEnv: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  if (!existsSync(path)) {
    return baseEnv;
  }

  const loaded: Record<string, string | undefined> = { ...baseEnv };

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    if (key === '') {
      continue;
    }

    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    if (loaded[key] === undefined) {
      loaded[key] = value;
    }
  }

  return loaded;
}

/** Keys read from `process.env` for local runtime / doctor. Unknown env vars are ignored. */
export function pickRuntimeEnv(
  env: Record<string, string | undefined>,
): Record<(typeof RUNTIME_ENV_KEYS)[number], string | undefined> {
  const out = {} as Record<
    (typeof RUNTIME_ENV_KEYS)[number],
    string | undefined
  >;
  for (const key of RUNTIME_ENV_KEYS) {
    out[key] = env[key];
  }
  return out;
}

const RUNTIME_ENV_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_COLLECTOR_HEALTH_URL',
  'JAEGER_UI_URL',
  'SYNAPSE_FIXTURE_MODE',
  'OPENAI_API_KEY',
  'SYNAPSE_AGENT_SQLITE_DIR',
  'SYNAPSE_AGENT_SQLITE_ADVISORY_LOCK_TIMEOUT_MS',
  'SYNAPSE_AGENT_SQLITE_MIGRATION_MAX_MS',
] as const;

const runtimeEnvSchema = z
  .object({
    DATABASE_URL: z
      .string()
      .url()
      .default('postgresql://synapse:synapse@127.0.0.1:25432/synapse'),
    REDIS_URL: z.string().url().default('redis://127.0.0.1:26379'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z
      .string()
      .url()
      .default('http://127.0.0.1:24318'),
    /** Collector `health_check` extension HTTP server (contrib image serves `/` on this port). */
    OTEL_COLLECTOR_HEALTH_URL: z
      .string()
      .url()
      .default('http://127.0.0.1:21333/'),
    JAEGER_UI_URL: z.string().url().default('http://127.0.0.1:26686'),
    SYNAPSE_FIXTURE_MODE: z.enum(['auto', 'on', 'off']).default('auto'),

    OPENAI_API_KEY: optionalCredentialSchema,

    SYNAPSE_AGENT_SQLITE_DIR: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    SYNAPSE_AGENT_SQLITE_ADVISORY_LOCK_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .optional(),
    SYNAPSE_AGENT_SQLITE_MIGRATION_MAX_MS: z.coerce
      .number()
      .int()
      .positive()
      .optional(),
  })
  .strict();

export type RuntimeConfig = {
  databaseUrl: string;
  redisUrl: string;
  otlpEndpoint: string;
  otelCollectorHealthUrl: string;
  jaegerUiUrl: string;
  /** True if any integration below is using fixtures (convenience for quick checks). */
  fixtureMode: boolean;
  fixtureModeSetting: 'auto' | 'on' | 'off';
  /** Per-integration: use fixture/fake behavior instead of live APIs when true. */
  fixtures: {
    openai: boolean;
  };
  credentials: {
    openai: boolean;
  };
  /** Raw env value; resolve with `getRepoRoot` when relative. */
  agentSqliteDir?: string;
  agentSqliteAdvisoryLockTimeoutMs: number;
  agentSqliteMigrationMaxMs: number;
};

/** Reads config from a full env bag (e.g. `process.env`); unknown keys are ignored before Zod parse. */
export function parseRuntimeConfig(
  env: Record<string, string | undefined>,
): RuntimeConfig {
  const parsed = runtimeEnvSchema.parse(pickRuntimeEnv(env));
  const credentials = {
    openai: Boolean(parsed.OPENAI_API_KEY),
  };
  const mode = parsed.SYNAPSE_FIXTURE_MODE;
  const fixtures = {
    openai: mode === 'on' || (mode === 'auto' && !credentials.openai),
  };
  const fixtureMode = fixtures.openai;

  return {
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    otlpEndpoint: parsed.OTEL_EXPORTER_OTLP_ENDPOINT,
    otelCollectorHealthUrl: parsed.OTEL_COLLECTOR_HEALTH_URL,
    jaegerUiUrl: parsed.JAEGER_UI_URL,
    fixtureMode,
    fixtureModeSetting: parsed.SYNAPSE_FIXTURE_MODE,
    fixtures,
    credentials,
    agentSqliteDir: parsed.SYNAPSE_AGENT_SQLITE_DIR,
    agentSqliteAdvisoryLockTimeoutMs:
      parsed.SYNAPSE_AGENT_SQLITE_ADVISORY_LOCK_TIMEOUT_MS ?? 30_000,
    agentSqliteMigrationMaxMs:
      parsed.SYNAPSE_AGENT_SQLITE_MIGRATION_MAX_MS ?? 300_000,
  };
}
