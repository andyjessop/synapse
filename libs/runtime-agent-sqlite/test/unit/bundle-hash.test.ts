import { describe, expect, it } from 'vitest';
import {
  computeMigrationBundleHash,
  computeNormalizedMigrationSqlHash,
  normalizeMigrationSqlForHash,
} from '../../src/bundle-hash';

describe('bundle-hash', () => {
  it('normalizes CRLF and trailing line whitespace', () => {
    const a = normalizeMigrationSqlForHash('select 1  \r\n');
    const b = normalizeMigrationSqlForHash('select 1\n');
    expect(a).toBe(b);
  });

  it('computes per-migration hash with sha256: prefix', () => {
    const h = computeNormalizedMigrationSqlHash('select 1;\n');
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it('collapses trailing blank lines to a single trailing newline', () => {
    expect(normalizeMigrationSqlForHash('select 1;\n\n')).toBe(
      normalizeMigrationSqlForHash('select 1;'),
    );
  });

  it('computes bundle hash from ordered id+hash pairs', () => {
    const a = computeMigrationBundleHash([
      { id: 'a', hash: 'sha256:' + 'a'.repeat(64) },
      { id: 'b', hash: 'sha256:' + 'b'.repeat(64) },
    ]);
    const b = computeMigrationBundleHash([
      { id: 'a', hash: 'sha256:' + 'a'.repeat(64) },
      { id: 'b', hash: 'sha256:' + 'b'.repeat(64) },
    ]);
    expect(a).toBe(b);
    expect(a).not.toBe(
      computeMigrationBundleHash([
        { id: 'b', hash: 'sha256:' + 'b'.repeat(64) },
        { id: 'a', hash: 'sha256:' + 'a'.repeat(64) },
      ]),
    );
  });
});
