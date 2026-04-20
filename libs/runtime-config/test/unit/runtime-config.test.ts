import { describe, expect, it } from 'vitest';
import { parseRuntimeConfig, pickRuntimeEnv } from '../../src/runtime-config';

const liveEnv = {
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/app',
  REDIS_URL: 'redis://127.0.0.1:6380',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4319',
  OTEL_COLLECTOR_HEALTH_URL: 'http://127.0.0.1:13134/',
  JAEGER_UI_URL: 'http://127.0.0.1:16687',
  OPENAI_API_KEY: 'openai-token',
};

describe('pickRuntimeEnv', () => {
  it('returns only known keys and drops unrelated process env entries', () => {
    const picked = pickRuntimeEnv({
      PATH: '/usr/bin',
      DATABASE_URL: 'postgresql://x:y@127.0.0.1:1/db',
      npm_lifecycle_event: 'test',
      GITHUB_TOKEN: 'should-not-appear',
    });

    expect(picked.DATABASE_URL).toBe('postgresql://x:y@127.0.0.1:1/db');
    expect(Reflect.get(picked, 'PATH')).toBeUndefined();
    expect(Object.hasOwn(picked, 'PATH')).toBe(false);
    expect(Reflect.get(picked, 'GITHUB_TOKEN')).toBeUndefined();
    expect(Object.hasOwn(picked, 'GITHUB_TOKEN')).toBe(false);
  });
});

describe('parseRuntimeConfig', () => {
  it('uses local defaults and fixture mode when credentials are absent', () => {
    const config = parseRuntimeConfig({});

    expect(config).toEqual({
      databaseUrl: 'postgresql://synapse:synapse@127.0.0.1:25432/synapse',
      redisUrl: 'redis://127.0.0.1:26379',
      otlpEndpoint: 'http://127.0.0.1:24318',
      otelCollectorHealthUrl: 'http://127.0.0.1:21333/',
      jaegerUiUrl: 'http://127.0.0.1:26686',
      fixtureMode: true,
      fixtureModeSetting: 'auto',
      fixtures: {
        openai: true,
      },
      credentials: {
        openai: false,
      },
      agentSqliteDir: undefined,
      agentSqliteAdvisoryLockTimeoutMs: 30_000,
      agentSqliteMigrationMaxMs: 300_000,
    });
  });

  it('disables fixtures in auto mode when live credentials are present', () => {
    const config = parseRuntimeConfig(liveEnv);

    expect(config.fixtureMode).toBe(false);
    expect(config.fixtures).toEqual({
      openai: false,
    });
    expect(config.credentials).toEqual({
      openai: true,
    });
  });

  it('respects explicit fixture mode overrides', () => {
    expect(
      parseRuntimeConfig({ ...liveEnv, SYNAPSE_FIXTURE_MODE: 'on' })
        .fixtureMode,
    ).toBe(true);
    expect(
      parseRuntimeConfig({ ...liveEnv, SYNAPSE_FIXTURE_MODE: 'on' }).fixtures,
    ).toEqual({
      openai: true,
    });
    expect(
      parseRuntimeConfig({ SYNAPSE_FIXTURE_MODE: 'off' }).fixtureMode,
    ).toBe(false);
    expect(
      parseRuntimeConfig({ SYNAPSE_FIXTURE_MODE: 'off' }).fixtures,
    ).toEqual({
      openai: false,
    });
  });

  it('treats empty credential strings as missing', () => {
    const config = parseRuntimeConfig({
      ...liveEnv,
      OPENAI_API_KEY: '',
    });

    expect(config.credentials.openai).toBe(false);
    expect(config.fixtures.openai).toBe(true);
    expect(config.fixtureMode).toBe(true);
  });

  it('ignores GITHUB_TOKEN and does not surface GitHub fixture or credential fields', () => {
    const config = parseRuntimeConfig({
      ...liveEnv,
      GITHUB_TOKEN: 'ghp_should_be_ignored',
    });

    expect(Reflect.get(config.fixtures, 'github')).toBeUndefined();
    expect(Reflect.get(config.credentials, 'github')).toBeUndefined();
    expect(config).toEqual(parseRuntimeConfig(liveEnv));
  });

  it('does not throw when unrelated env keys are present on the input object', () => {
    expect(() =>
      parseRuntimeConfig({ PATH: '/usr/bin', HOME: '/Users/me' }),
    ).not.toThrow();
  });

  it('rejects invalid URLs and unknown fixture mode values', () => {
    expect(() => parseRuntimeConfig({ DATABASE_URL: 'not a url' })).toThrow();
    expect(() =>
      parseRuntimeConfig({ SYNAPSE_FIXTURE_MODE: 'sometimes' }),
    ).toThrow();
  });
});
