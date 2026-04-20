import { describe, expect, it } from 'vitest';
import { readSqliteErrorCode } from '../../src/sqlite-codes';

describe('readSqliteErrorCode', () => {
  it('reads code from Error.cause chain', () => {
    const inner = Object.assign(new Error('inner'), {
      code: 'SQLITE_NOTADB',
    });
    const outer = new Error('outer', { cause: inner });
    expect(readSqliteErrorCode(outer)).toBe('SQLITE_NOTADB');
  });
});
