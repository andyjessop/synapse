import { describe, expect, it } from 'vitest';
import { computeNormalizedMigrationSqlHash } from '../../src/bundle-hash';
import { assertValidSqliteMigrations } from '../../src/validate-migrations';

describe('assertValidSqliteMigrations', () => {
  it('accepts a migration whose hash matches normalized SQL', () => {
    const sql = 'create table x(y int);\n';
    expect(() =>
      assertValidSqliteMigrations([
        {
          id: '001',
          sql,
          hash: computeNormalizedMigrationSqlHash(sql),
        },
      ]),
    ).not.toThrow();
  });

  it('rejects hash mismatch', () => {
    expect(() =>
      assertValidSqliteMigrations([
        {
          id: '001',
          sql: 'select 1;\n',
          hash: 'sha256:' + '0'.repeat(64),
        },
      ]),
    ).toThrow(/does not match normalized SQL hash/);
  });

  it('rejects empty list', () => {
    expect(() => assertValidSqliteMigrations([])).toThrow(/non-empty/);
  });
});
