import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = join(packageRoot, '../..');
const composeFile = join(repoRoot, 'local/docker-compose.yml');
const collectorConfigFile = join(repoRoot, 'local/otel/collector-config.yaml');

describe('local infrastructure config', () => {
  it('defines the required local services and chosen images', () => {
    const compose = readFileSync(composeFile, 'utf8');

    expect(compose).toContain('postgres:16');
    expect(compose).toContain('redis:7');
    expect(compose).toContain('otel/opentelemetry-collector-contrib:0.114.0');
    expect(compose).toContain('jaegertracing/all-in-one:1.62.0');
  });

  it('binds service ports only to localhost', () => {
    const compose = readFileSync(composeFile, 'utf8');
    const portLines = compose
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- "127.0.0.1:'));

    const expected = new Set([
      '- "127.0.0.1:25432:5432"',
      '- "127.0.0.1:26379:6379"',
      '- "127.0.0.1:24317:4317"',
      '- "127.0.0.1:24318:4318"',
      '- "127.0.0.1:21333:13133"',
      '- "127.0.0.1:26686:16686"',
      '- "127.0.0.1:24250:14250"',
    ]);

    expect(new Set(portLines)).toEqual(expected);
    expect(portLines.every((line) => line.startsWith('- "127.0.0.1:'))).toBe(
      true,
    );
  });

  it('wires OpenTelemetry collector health and Jaeger export', () => {
    const collectorConfig = readFileSync(collectorConfigFile, 'utf8');

    expect(collectorConfig).toContain('endpoint: 0.0.0.0:13133');
    expect(collectorConfig).toContain('endpoint: jaeger:4317');
    expect(collectorConfig).toContain('extensions: [health_check]');
  });

  it('has an Nx-discoverable package and no project.json', () => {
    const manifest = JSON.parse(
      readFileSync(join(packageRoot, 'package.json'), 'utf8'),
    ) as {
      name?: string;
      scripts?: Record<string, string>;
    };

    expect(manifest.name).toBe('runtime-config');
    expect(manifest.scripts?.test).toBe('vitest run --coverage');
    expect(manifest.scripts?.typecheck).toBe(
      'tsc --noEmit -p ../../tsconfig.json',
    );
    expect(manifest.scripts?.lint).toBe('biome check .');
    expect(existsSync(join(packageRoot, 'project.json'))).toBe(false);
  });
});
