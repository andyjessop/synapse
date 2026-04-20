import { describe, expect, it } from 'vitest';

import {
  resolveRootGraphWaitMaxMs,
  resolveRootGraphWaitPollParams,
} from './resolve-root-graph-wait.js';

describe('resolveRootGraphWaitMaxMs', () => {
  it('is unbounded by default', () => {
    expect(resolveRootGraphWaitMaxMs({})).toBeUndefined();
  });

  it('reads DEV_ONCE_MAX_WAIT_MS when set', () => {
    expect(resolveRootGraphWaitMaxMs({ DEV_ONCE_MAX_WAIT_MS: '120000' })).toBe(
      120_000,
    );
  });

  it('derives maxPolls only when capped', () => {
    expect(resolveRootGraphWaitPollParams({})).toEqual({
      maxPolls: undefined,
      pollMs: 500,
      maxMs: undefined,
    });
    const capped = resolveRootGraphWaitPollParams({
      DEV_ONCE_MAX_WAIT_MS: '10000',
      DEV_ONCE_POLL_MS: '1000',
    });
    expect(capped.maxMs).toBe(10_000);
    expect(capped.pollMs).toBe(1000);
    expect(capped.maxPolls).toBe(10);
  });
});
