import { describe, expect, it } from 'vitest';
import {
  PiReviewFailedError,
  PiReviewTimedOutError,
  PiReviewUnavailableError,
} from '../../src/pi-review-client';

describe('Pi review errors', () => {
  it('exposes retryable flags', () => {
    expect(new PiReviewFailedError('x', 1).retryable).toBe(true);
    expect(new PiReviewTimedOutError('x').retryable).toBe(true);
    expect(new PiReviewUnavailableError('x').retryable).toBe(false);
  });
});
