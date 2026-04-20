import { describe, expect, it } from 'vitest';
import { computeAgentSqliteAdvisoryLockInts } from '../../src/advisory-key';

describe('computeAgentSqliteAdvisoryLockInts', () => {
  it('returns stable int32 pair for a fixed agent name', () => {
    expect(computeAgentSqliteAdvisoryLockInts('example-echo')).toEqual(
      computeAgentSqliteAdvisoryLockInts('example-echo'),
    );
  });

  it('returns different pairs for different agent names (sample)', () => {
    const a = computeAgentSqliteAdvisoryLockInts('sqlite-agent');
    const b = computeAgentSqliteAdvisoryLockInts('sqlite-bad');
    expect(a).not.toEqual(b);
  });
});
