import { describe, expect, it } from 'vitest';
import {
  extractPollEmitCount,
  extractPollRootEventId,
} from '../../src/poll-response.js';

describe('poll-response', () => {
  it('extractPollEmitCount reads emitted from summary', () => {
    expect(extractPollEmitCount({ emitted: 2, skipped: 0 })).toBe(2);
    expect(extractPollEmitCount({})).toBe(0);
  });

  it('extractPollRootEventId returns first event id', () => {
    expect(
      extractPollRootEventId({
        emitted: 2,
        rootEventIds: ['evt_a', 'evt_b'],
      }),
    ).toBe('evt_a');
    expect(extractPollRootEventId({ emitted: 0 })).toBeUndefined();
  });
});
