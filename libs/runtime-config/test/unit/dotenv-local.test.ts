import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getRepoRoot } from '../../src/paths';
import * as RC from '../../src/runtime-config';

describe('loadDotEnvLocal', () => {
  it('returns the same base reference when the file is missing', () => {
    const base = { FOO: 'bar' };
    const dir = mkdtempSync(join(tmpdir(), 'synapse-dotenv-'));
    const path = join(dir, 'missing.env');

    expect(RC.loadDotEnvLocal(path, base)).toBe(base);
  });

  it('applies KEY=value for keys that are undefined in the base copy', () => {
    const dir = mkdtempSync(join(tmpdir(), 'synapse-dotenv-'));
    const path = join(dir, '.env.local');
    writeFileSync(
      path,
      [
        '',
        '  # comment',
        'DATABASE_URL=postgresql://fromfile@127.0.0.1:9/db',
        'NO_EQUALS',
        ' REDIS_URL = redis://127.0.0.1:1884 ',
        `QUOTED="double"`,
        `SINGLE='single'`,
      ].join('\n'),
      'utf8',
    );

    const out = RC.loadDotEnvLocal(path, {});

    expect(out.DATABASE_URL).toBe('postgresql://fromfile@127.0.0.1:9/db');
    expect(out.REDIS_URL).toBe('redis://127.0.0.1:1884');
    expect(out.QUOTED).toBe('double');
    expect(out.SINGLE).toBe('single');
    expect(out.NO_EQUALS).toBeUndefined();
  });

  it('does not override keys already present in the base (process wins over file)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'synapse-dotenv-'));
    const path = join(dir, '.env.local');
    writeFileSync(path, 'DATABASE_URL=postgresql://fromfile\n', 'utf8');

    const out = RC.loadDotEnvLocal(path, {
      DATABASE_URL: 'postgresql://frombase',
    });

    expect(out.DATABASE_URL).toBe('postgresql://frombase');
  });

  it('does not override when the base sets an empty string', () => {
    const dir = mkdtempSync(join(tmpdir(), 'synapse-dotenv-'));
    const path = join(dir, '.env.local');
    writeFileSync(path, 'DATABASE_URL=postgresql://fromfile\n', 'utf8');

    const out = RC.loadDotEnvLocal(path, { DATABASE_URL: '' });

    expect(out.DATABASE_URL).toBe('');
  });

  it('skips lines with an empty key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'synapse-dotenv-'));
    const path = join(dir, '.env.local');
    writeFileSync(path, '=nokey\nFOO=bar\n', 'utf8');

    const out = RC.loadDotEnvLocal(path, {});

    expect(out.FOO).toBe('bar');
    expect(out['']).toBeUndefined();
  });

  it('keeps unquoted values that only start with a quote', () => {
    const dir = mkdtempSync(join(tmpdir(), 'synapse-dotenv-'));
    const path = join(dir, '.env.local');
    writeFileSync(path, 'EDGE="not-closed\n', 'utf8');

    const out = RC.loadDotEnvLocal(path, {});

    expect(out.EDGE).toBe('"not-closed');
  });

  it('resolves the doctor path as repo root .env.local', () => {
    const path = join(getRepoRoot(), '.env.local');
    expect(path).toMatch(/[\\/]\.env\.local$/);
  });
});
